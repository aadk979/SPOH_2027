import { randomUUID } from 'node:crypto';
import type { IdentityInvitationAttempt, IdentityInvitationState } from '../../generated/prisma/client.js';
import type { PrismaTransactionClient } from './client.js';
import { identityDigest } from '../identity/accountProfile.js';
import { accountOperationChanged } from './identityAccountRepo.js';

export type InvitationAttempt = IdentityInvitationAttempt;
export interface InvitationIntent {
  targetPoolId: string;
  organisationId: string;
  personId: string;
  actorPersonId: string;
  accountId?: string;
  requestKey: string;
}

export async function existingInvitation(tx: PrismaTransactionClient, input: InvitationIntent) {
  const requestDigest = identityDigest(['invitation', input.targetPoolId, input.organisationId,
    input.personId, input.requestKey]);
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${requestDigest}, 0))`;
  const existing = await tx.identityInvitationAttempt.findUnique({ where: { requestDigest } });
  return { existing, requestDigest };
}

export function createInvitationAttempt(tx: PrismaTransactionClient,
  input: InvitationIntent & { requestDigest: string; now: Date }): Promise<InvitationAttempt> {
  return tx.identityInvitationAttempt.create({ data: { id: randomUUID(), targetPoolId: input.targetPoolId,
    organisationId: input.organisationId, personId: input.personId, actorPersonId: input.actorPersonId,
    accountId: input.accountId ?? null, requestDigest: input.requestDigest, startedAt: input.now } });
}

export async function finishInvitationAttempt(tx: PrismaTransactionClient,
  input: { id: string; state: IdentityInvitationState; now: Date }): Promise<void> {
  const { count } = await tx.identityInvitationAttempt.updateMany({ where: { id: input.id, state: 'STARTED' },
    data: { state: input.state, finishedAt: input.now } });
  if (count !== 1) throw accountOperationChanged();
}
