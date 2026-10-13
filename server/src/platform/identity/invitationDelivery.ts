import { writeAudit, type AuditContext } from '../audit/index.js';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { createInvitationAttempt, existingInvitation, finishInvitationAttempt,
  type InvitationIntent } from '../db/identityInvitationRepo.js';
import { accountOperationChanged } from '../db/identityAccountRepo.js';
import { ForbiddenError, ServiceUnavailableError } from '../errors/index.js';
import { systemClock } from '../time/index.js';
import { reserveIdentityDeliveriesForPool } from './deliveryQuota.js';
import type { IdentityProvider } from './provisioning.js';

export interface InvitationDelivery extends InvitationIntent {
  provider: IdentityProvider;
  audit: AuditContext;
  /** Must reload current authority and hold the target Person before child locks. */
  authorize(tx: PrismaTransactionClient): Promise<void>;
}

/** A send is a durable stage after binding, never an external effect inside an outer SQL transaction. */
export async function deliverIdentityInvitation(input: InvitationDelivery): Promise<{ sent: boolean }> {
  if (input.provider.poolId !== input.targetPoolId) throw accountOperationChanged();
  const started = await beginInvitation(input);
  if (!started.attempt) return { sent: started.sent };
  let sent: boolean;
  try {
    sent = await input.provider.resendInvite(started.email, started.subject);
  } catch {
    await completeInvitation(input, { id: started.attempt.id, state: 'DELIVERY_UNKNOWN' });
    throw new ServiceUnavailableError('The invitation outcome is unknown. Check it before starting another invitation.');
  }
  await completeInvitation(input, { id: started.attempt.id, state: sent ? 'ACCEPTED' : 'NOT_ELIGIBLE' });
  return { sent };
}

async function beginInvitation(input: InvitationDelivery) {
  return prisma.$transaction(async (tx) => {
    await input.authorize(tx);
    const { existing, requestDigest } = await existingInvitation(tx, input);
    if (existing?.state === 'STARTED' || existing?.state === 'DELIVERY_UNKNOWN')
      throw new ServiceUnavailableError('This invitation outcome is unknown. It will not be sent again under the same request.');
    if (existing) return { attempt: null, email: '', subject: '', sent: existing.state === 'ACCEPTED' };
    const person = await tx.person.findUniqueOrThrow({ where: { id: input.personId },
      select: { email: true, cognitoSub: true, deactivatedAt: true, piiErasedAt: true } });
    if (person.deactivatedAt || person.piiErasedAt) throw new ForbiddenError('This account cannot receive an invitation.');
    if (input.accountId) await requireBoundInvitationAccount(tx, input);
    const now = systemClock.now();
    await reserveIdentityDeliveriesForPool(tx, { ...input, count: 1, now });
    const attempt = await createInvitationAttempt(tx, { ...input, requestDigest, now });
    await writeAudit(tx, { ...input.audit, action: 'identity.invitation.start',
      entityType: 'IdentityInvitationAttempt', entityId: attempt.id,
      after: { personId: input.personId, targetPoolId: input.targetPoolId, state: 'STARTED' } });
    return { attempt, email: person.email, subject: person.cognitoSub, sent: false };
  });
}

async function requireBoundInvitationAccount(tx: PrismaTransactionClient, input: InvitationDelivery) {
  const account = await tx.identityAccountOperation.findUniqueOrThrow({ where: { id: input.accountId } });
  if (account.state !== 'BOUND' || account.personId !== input.personId ||
    account.targetPoolId !== input.targetPoolId || account.organisationId !== input.organisationId)
    throw accountOperationChanged();
}

async function completeInvitation(input: InvitationDelivery,
  result: { id: string; state: 'ACCEPTED' | 'DELIVERY_UNKNOWN' | 'NOT_ELIGIBLE' }) {
  await prisma.$transaction(async (tx) => {
    await finishInvitationAttempt(tx, { ...result, now: systemClock.now() });
    await writeAudit(tx, { ...input.audit, action: 'identity.invitation.finish',
      entityType: 'IdentityInvitationAttempt', entityId: result.id,
      after: { personId: input.personId, state: result.state, providerAccepted: result.state === 'ACCEPTED' } });
  });
}
