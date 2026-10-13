import { env } from '../../config/env.js';
import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { AppError } from '../errors/index.js';
import { ERROR_CODES } from '@spoh/shared';
import { loadResolvedSetting } from '../settings/scopedStore.js';
import { ValidationError } from '../errors/index.js';

/** The default sender's allowance is shared by all instances and all events in its pool. */
export async function reserveIdentityDeliveries(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; count: number; now: Date },
): Promise<void> {
  if (env.AUTH_PROVIDER !== 'cognito' || input.count === 0) return;
  const event = await tx.event.findUniqueOrThrow({
    where: { id: input.scope.eventId }, select: { organisationId: true },
  });
  return reserveIdentityDeliveriesForPool(tx, { targetPoolId: env.COGNITO_USER_POOL_ID!,
    organisationId: event.organisationId, count: input.count, now: input.now });
}

/** Recovery and ordinary invitations use the same explicit target-pool UTC allowance. */
export async function reserveIdentityDeliveriesForPool(tx: PrismaTransactionClient,
  input: { targetPoolId: string; organisationId: string; count: number; now: Date }): Promise<void> {
  if (!input.targetPoolId || !Number.isSafeInteger(input.count) || input.count < 0)
    throw new ValidationError('An explicit pool and valid invitation count are required.');
  if (input.count === 0 || input.targetPoolId === 'local') return;
  const configured = Number((await loadResolvedSetting('identity.inviteDailyLimit', {
    organisationId: input.organisationId,
  }, tx)).value);
  const limit = Math.min(50, configured);
  const day = input.now.toISOString().slice(0, 10);
  const id = `${input.targetPoolId}:${day}`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
  const used = (await tx.identityDeliveryQuota.findUnique({ where: { id } }))?.used ?? 0;
  if (used + input.count > limit) throw new AppError(429, ERROR_CODES.RATE_LIMITED,
    `The identity email allowance has ${Math.max(0, limit - used)} deliveries left today. Import a smaller batch or try tomorrow.`);
  await tx.identityDeliveryQuota.upsert({
    where: { id }, create: { id, used: input.count,
      expiresAt: new Date(new Date(`${day}T00:00:00Z`).getTime() + 2 * 86400000) },
    update: { used: { increment: input.count } },
  });
}

export async function identitiesByEmail(tx: PrismaTransactionClient, emails: readonly string[]) {
  const rows = await tx.person.findMany({
    where: { email: { in: [...emails], mode: 'insensitive' } },
    select: { email: true, cognitoSub: true, deactivatedAt: true, piiErasedAt: true },
  });
  return new Map(rows.map((row) => [row.email.toLowerCase(), row]));
}
