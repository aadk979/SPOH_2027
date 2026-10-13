import { env } from '../../../config/env.js';
import { requireCurrentOrganisationPermission } from '../../../platform/access/currentOrganisation.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { prisma } from '../../../platform/db/client.js';
import { holdIdentityPeople } from '../../../platform/db/identityAccountRepo.js';
import { ForbiddenError, UnauthenticatedError, ValidationError } from '../../../platform/errors/index.js';
import { verifyAccessToken } from '../../../platform/identity/sessionTokens.js';
import type { Clock } from '../../../platform/time/index.js';
import { currentOperatorSession, holdRecoveryEvents, operatorPerson, recoveryPerson, type RecoveryPerson } from '../data/repo.js';

export interface RecoveryOperator { personId: string; subject: string; sessionId: string }

/** Only an API-signed, full device session is operator evidence; caller-supplied identity is insufficient. */
export async function verifyRecoveryOperator(token: string): Promise<RecoveryOperator> {
  if (env.AUTH_PROVIDER !== 'cognito') throw new ValidationError('Recovery requires Cognito authentication.');
  const claims = await verifyAccessToken(token);
  if (!claims) throw new UnauthenticatedError();
  // The Person id is resolved again inside each transaction before any effect.
  const person = await prisma.$transaction((tx) => operatorPerson(tx, claims.sub));
  if (!person) throw new UnauthenticatedError();
  return { personId: person.id, subject: claims.sub, sessionId: claims.sid };
}

export async function holdRecoveryAuthority(tx: PrismaTransactionClient, input: {
  organisationId: string; operator: RecoveryOperator; clock: Clock; personId?: string;
}): Promise<RecoveryPerson | null> {
  await holdRecoveryEvents(tx, input);
  await holdIdentityPeople(tx, [input.operator.personId, ...(input.personId ? [input.personId] : [])]);
  await requireFreshOperator(tx, input);
  await requireCurrentOrganisationPermission(tx, { organisationId: input.organisationId,
    personId: input.operator.personId, subject: input.operator.subject, action: 'Platform.ManageAdmins' });
  if (!input.personId) return null;
  if (input.personId === input.operator.personId) throw new ForbiddenError('Use a different administrator to recover this account.');
  const person = await recoveryPerson(tx, input.personId);
  if (!person || !eligible(person, input.organisationId)) throw new ForbiddenError('This person is not eligible for recovery.');
  for (const organisationId of affectedOrganisations(person)) {
    if (organisationId === input.organisationId) continue;
    await requireCurrentOrganisationPermission(tx, { organisationId, personId: input.operator.personId,
      subject: input.operator.subject, action: 'Platform.ManageAdmins' });
  }
  return person;
}

async function requireFreshOperator(tx: PrismaTransactionClient,
  input: { operator: RecoveryOperator; clock: Clock }) {
  const session = await currentOperatorSession(tx, input.operator.sessionId);
  // Sample after every authority/session lock wait; a queued request cannot retain freshness.
  const now = input.clock.now();
  if (!session || !operatorSessionStanding(session, { operator: input.operator, now }))
    throw new UnauthenticatedError('Sign in again before recovering identities.');
  const authenticatedAt = session?.authenticatedAt?.getTime();
  const age = authenticatedAt === undefined ? Infinity : now.getTime() - authenticatedAt;
  if (age < 0 || age > 5 * 60_000) throw new UnauthenticatedError('Sign in again before recovering identities.');
}

function operatorSessionStanding(session: NonNullable<Awaited<ReturnType<typeof currentOperatorSession>>>,
  input: { operator: RecoveryOperator; now: Date }) {
  return session.volunteerId === input.operator.personId && !session.revokedAt && !session.mfaPending &&
    session.expiresAt > input.now && session.absoluteExpiresAt !== null && session.absoluteExpiresAt > input.now;
}

function eligible(person: RecoveryPerson, organisationId: string) {
  return !person.deactivatedAt && !person.piiErasedAt && (
    person.organisationMemberships.some((row) => row.organisationId === organisationId && row.role === 'PLATFORM_ADMIN') ||
    person.eventMemberships.some((row) => row.event.organisationId === organisationId &&
      row.event.status !== 'ARCHIVED' && ['ACTIVE', 'INVITED'].includes(row.status)));
}

function affectedOrganisations(person: RecoveryPerson) {
  return [...new Set([...person.organisationMemberships.map((row) => row.organisationId),
    ...person.eventMemberships.map((row) => row.event.organisationId)])].sort();
}
