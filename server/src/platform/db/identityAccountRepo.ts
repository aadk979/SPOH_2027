import { randomUUID } from 'node:crypto';
import type { IdentityAccountOperation } from '../../generated/prisma/client.js';
import { ERROR_CODES } from '@spoh/shared';
import { ConflictError } from '../errors/index.js';
import { accountProfileDigests, identityDigest, type AccountProfile } from '../identity/accountProfile.js';
import type { PrismaTransactionClient } from './client.js';

export type AccountOperation = IdentityAccountOperation;
export interface AccountPlan {
  targetPoolId: string;
  organisationId: string;
  actorPersonId: string;
  personId?: string;
  expectedSubject?: string;
  profile: AccountProfile;
  now: Date;
}

/** Authority is checked by the caller before this durable external-effect intent is committed. */
export async function prepareIdentityAccount(tx: PrismaTransactionClient, input: AccountPlan): Promise<AccountOperation> {
  const digests = accountProfileDigests(input.profile);
  const key = JSON.stringify([input.targetPoolId, digests.emailDigest]);
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const existing = await tx.identityAccountOperation.findUnique({ where: {
    targetPoolId_emailDigest: { targetPoolId: input.targetPoolId, emailDigest: digests.emailDigest },
  } });
  if (existing) return reclaimIdentityAccount(tx, { existing, input, profileDigest: digests.profileDigest });
  return tx.identityAccountOperation.create({ data: {
    id: randomUUID(), targetPoolId: input.targetPoolId, organisationId: input.organisationId,
    personId: input.personId ?? null, plannedPersonId: input.personId ?? randomUUID(),
    actorPersonId: input.actorPersonId, ...digests,
    expectedSubjectDigest: input.expectedSubject ? identityDigest(['subject', input.expectedSubject]) : null,
    generation: randomUUID(), leaseExpiresAt: new Date(input.now.getTime() + 60_000),
    createdAt: input.now, updatedAt: input.now,
  } });
}

async function reclaimIdentityAccount(tx: PrismaTransactionClient,
  { existing, input, profileDigest }: { existing: AccountOperation; input: AccountPlan; profileDigest: string }) {
  const expected = input.expectedSubject ? identityDigest(['subject', input.expectedSubject]) : null;
  assertMatchingAccountIntent({ existing, input, profileDigest, expected });
  if (existing.state === 'BOUND') return existing;
  if (existing.state === 'CREATE_STARTED' && existing.leaseExpiresAt > input.now)
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The account operation is still running. Retry the same input shortly.');
  return tx.identityAccountOperation.update({ where: { id: existing.id }, data: {
    generation: randomUUID(), actorPersonId: input.actorPersonId, updatedAt: input.now,
    leaseExpiresAt: new Date(input.now.getTime() + 60_000),
  } });
}

function assertMatchingAccountIntent({ existing, input, profileDigest, expected }: {
  existing: AccountOperation; input: AccountPlan; profileDigest: string; expected: string | null;
}) {
  const subjectMatches = existing.expectedSubjectDigest === expected || (existing.state === 'BOUND' &&
    existing.providerSubject !== null && expected === identityDigest(['subject', existing.providerSubject]));
  if (existing.organisationId !== input.organisationId || existing.profileDigest !== profileDigest ||
    existing.plannedPersonId !== (input.personId ?? existing.plannedPersonId) ||
    !subjectMatches)
    throw accountOperationChanged();
}

export async function recordProviderIdentity(tx: PrismaTransactionClient, input: {
  operation: AccountOperation; sub: string; username: string; now: Date;
}): Promise<AccountOperation> {
  const { count } = await tx.identityAccountOperation.updateMany({ where: {
    id: input.operation.id, generation: input.operation.generation, state: 'CREATE_STARTED',
  }, data: { state: 'PROVIDER_READY', providerSubject: input.sub, providerUsername: input.username,
    updatedAt: input.now } });
  if (count !== 1) throw accountOperationChanged();
  return tx.identityAccountOperation.findUniqueOrThrow({ where: { id: input.operation.id } });
}

/** Binding belongs to the same transaction as the person/member write and credential invalidation. */
export async function bindIdentityAccount(tx: PrismaTransactionClient, input: {
  operation: AccountOperation; personId: string; profile: AccountProfile; now: Date;
}): Promise<void> {
  const { operation } = input;
  if (operation.plannedPersonId !== input.personId || !operation.providerSubject ||
    accountProfileDigests(input.profile).profileDigest !== operation.profileDigest) throw accountOperationChanged();
  const person = await tx.person.findUniqueOrThrow({ where: { id: input.personId }, select: {
    email: true, displayName: true, phone: true, cognitoSub: true, deactivatedAt: true, piiErasedAt: true,
  } });
  if (person.deactivatedAt || person.piiErasedAt || person.cognitoSub !== operation.providerSubject ||
    accountProfileDigests(person).profileDigest !== operation.profileDigest) throw accountOperationChanged();
  const { count } = await tx.identityAccountOperation.updateMany({ where: {
    id: operation.id, generation: operation.generation, state: 'PROVIDER_READY',
    profileDigest: operation.profileDigest, providerSubject: operation.providerSubject,
  }, data: { personId: input.personId, state: 'BOUND', boundAt: input.now, updatedAt: input.now } });
  if (count !== 1) throw accountOperationChanged();
}

/** All credential and authority writers take this order before memberships and sessions. */
export async function holdIdentityPeople(tx: PrismaTransactionClient, ids: readonly string[]): Promise<void> {
  const ordered = [...new Set(ids)].sort();
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ANY(${ordered}::text[]) ORDER BY id FOR UPDATE`;
}

export function accountOperationChanged(): ConflictError {
  return new ConflictError(ERROR_CODES.CONFLICT, 'The planned account state changed. Review before trying again.');
}

/** Ordinary retries revisit the original bound account and invitation, without adopting another operation. */
export async function boundAccountForPerson(tx: PrismaTransactionClient, input: {
  targetPoolId: string; organisationId: string; personId: string;
}): Promise<AccountOperation | null> {
  const operation = await tx.identityAccountOperation.findUnique({ where: { targetPoolId_personId: {
    targetPoolId: input.targetPoolId, personId: input.personId,
  } } });
  if (!operation || operation.state !== 'BOUND') return null;
  const person = await tx.person.findUniqueOrThrow({ where: { id: input.personId }, select: {
    email: true, displayName: true, phone: true, cognitoSub: true, deactivatedAt: true, piiErasedAt: true,
  } });
  if (operation.organisationId !== input.organisationId || operation.plannedPersonId !== input.personId ||
    operation.providerSubject !== person.cognitoSub || person.deactivatedAt || person.piiErasedAt ||
    operation.profileDigest !== accountProfileDigests(person).profileDigest) return null;
  return operation;
}
