import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { DeliveryOutcome } from '../domain/deliveryOutcome.js';
import type { Audience } from '../domain/audience.js';
import { audienceMembershipWhere } from './audienceWhere.js';
import type { ClaimedDelivery } from './deliveryClaimRepo.js';

export async function lockClaimedDelivery(
  tx: PrismaTransactionClient,
  claim: ClaimedDelivery,
  sampleNow: () => Date,
) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${claim.eventId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "AnnouncementPushDelivery" WHERE "eventId" = ${claim.eventId} AND id = ${claim.id} FOR UPDATE`;
  const now = sampleNow();
  const row = await tx.announcementPushDelivery.findFirst({
    where: {
      eventId: claim.eventId,
      id: claim.id,
      status: 'RUNNING',
      version: claim.version,
      attempts: claim.attempts,
      lockedBy: claim.lockedBy,
      lockedUntil: { gte: now },
    },
    include: { plan: { include: { announcement: true } } },
  });
  if (!row) return null;
  const event = await tx.event.findUniqueOrThrow({
    where: { id: claim.eventId },
    select: { status: true, slug: true, timezone: true, dayBoundaryMinutes: true },
  });
  return { row, now, event };
}
export type LockedDelivery = NonNullable<Awaited<ReturnType<typeof lockClaimedDelivery>>>;

export async function currentDeliveryRecipient(
  tx: PrismaTransactionClient,
  input: { locked: LockedDelivery; audience: Audience; today: Date },
) {
  const { row } = input.locked;
  const member = await tx.eventMembership.findFirst({
    where: { eventId: row.eventId, id: row.recipientMembershipId, personId: row.recipientPersonId },
    select: { status: true },
  });
  const eligible = await tx.eventMembership.findFirst({
    where: {
      ...audienceMembershipWhere(
        { eventId: row.eventId },
        { audience: input.audience, today: input.today },
      ),
      id: row.recipientMembershipId,
      personId: row.recipientPersonId,
    },
    select: { id: true },
  });
  return { member, eligible: !!eligible };
}

export function currentDeliverySubscription(tx: PrismaTransactionClient, id: string) {
  return tx.pushSubscription.findUnique({
    where: { id },
    select: { id: true, volunteerId: true, endpoint: true, p256dh: true, auth: true },
  });
}
export type DeliverySubscription = NonNullable<
  Awaited<ReturnType<typeof currentDeliverySubscription>>
>;

/** Consume this claim token once before external I/O; a duplicate executor becomes stale. */
export async function reserveDeliverySend(tx: PrismaTransactionClient, claim: ClaimedDelivery) {
  await tx.announcementPushDelivery.update({
    where: { eventId: claim.eventId, id: claim.id, status: 'RUNNING', version: claim.version },
    data: { version: { increment: 1 } },
  });
  return { ...claim, version: claim.version + 1 };
}

export async function finishDelivery(
  tx: PrismaTransactionClient,
  input: { claim: ClaimedDelivery; now: Date; outcome: DeliveryOutcome },
) {
  const { claim, now, outcome } = input;
  const result = await tx.announcementPushDelivery.updateMany({
    where: {
      eventId: claim.eventId,
      id: claim.id,
      status: 'RUNNING',
      version: claim.version,
      attempts: claim.attempts,
      lockedBy: claim.lockedBy,
      lockedUntil: { gte: now },
    },
    data: {
      ...outcome,
      lockedBy: null,
      lockedUntil: null,
      completedAt: outcome.status === 'PENDING' ? null : now,
      version: { increment: 1 },
    },
  });
  return result.count === 1 ? outcome.status : ('STALE' as const);
}

/** Parent device first, after the delivery outcome commits: avoid FK-nullification lock inversions. */
export function pruneUnchangedGoneDevice(original: DeliverySubscription) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PushSubscription" WHERE id = ${original.id} FOR UPDATE`;
      const current = await currentDeliverySubscription(tx, original.id);
      if (
        !current ||
        current.volunteerId !== original.volunteerId ||
        current.endpoint !== original.endpoint ||
        current.p256dh !== original.p256dh ||
        current.auth !== original.auth
      )
        return;
      await tx.pushSubscription.delete({ where: { id: original.id } });
    },
    { isolationLevel: 'ReadCommitted', timeout: 5_000 },
  );
}
