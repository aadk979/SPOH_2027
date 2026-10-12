import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { NoticeOutcome } from '../domain/noticeOutcome.js';

export interface NoticeClaim {
  id: string; eventId: string; version: number; attempts: number; maxAttempts: number;
  lockedBy: string; lockedUntil: Date; exhausted: boolean;
}
export function claimNoticeRows(tx: PrismaTransactionClient, input: {
  workerId: string; now: Date; leaseUntil: Date;
}) {
  return tx.$queryRaw<NoticeClaim[]>`WITH due AS (
    SELECT id, attempts >= "maxAttempts" AS exhausted FROM "NoticeDelivery"
    WHERE (status = 'PENDING' AND "runAt" <= ${input.now})
      OR (status = 'RUNNING' AND "lockedUntil" < ${input.now})
    ORDER BY "runAt", id FOR UPDATE SKIP LOCKED LIMIT 5
  ) UPDATE "NoticeDelivery" AS delivery SET status = 'RUNNING',
    "lockedBy" = ${input.workerId}, "lockedUntil" = ${input.leaseUntil},
    attempts = LEAST(attempts + 1, "maxAttempts"), version = version + 1
  FROM due WHERE delivery.id = due.id RETURNING delivery.id, delivery."eventId",
    delivery.version, delivery.attempts, delivery."maxAttempts", delivery."lockedBy",
    delivery."lockedUntil", due.exhausted`;
}

export async function lockedNoticeDelivery(tx: PrismaTransactionClient, input: {
  claim: NoticeClaim; now: () => Date;
}) {
  const { claim } = input;
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${claim.eventId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "NoticeDelivery" WHERE "eventId" = ${claim.eventId}
    AND id = ${claim.id} FOR UPDATE`;
  const now = input.now();
  const row = await tx.noticeDelivery.findFirst({ where: { eventId: claim.eventId,
    id: claim.id, status: 'RUNNING', version: claim.version, attempts: claim.attempts,
    lockedBy: claim.lockedBy, lockedUntil: { gte: now } }, include: { notice: true } });
  return row ? { row, now } : null;
}

export async function reserveNoticeSend(tx: PrismaTransactionClient, claim: NoticeClaim) {
  await tx.noticeDelivery.update({ where: { eventId: claim.eventId, id: claim.id,
    status: 'RUNNING', version: claim.version }, data: { version: { increment: 1 } } });
  return { ...claim, version: claim.version + 1 };
}

export async function finishNoticeDelivery(tx: PrismaTransactionClient, input: {
  claim: NoticeClaim; now: Date; outcome: NoticeOutcome;
}) {
  const { claim, now, outcome } = input;
  const result = await tx.noticeDelivery.updateMany({ where: { eventId: claim.eventId,
    id: claim.id, status: 'RUNNING', version: claim.version, attempts: claim.attempts,
    lockedBy: claim.lockedBy, lockedUntil: { gte: now } }, data: { ...outcome,
    lockedBy: null, lockedUntil: null, completedAt: outcome.status === 'PENDING' ? null : now,
    version: { increment: 1 } } });
  return result.count === 1 ? outcome.status : 'STALE' as const;
}

export function noticeDevice(tx: PrismaTransactionClient, id: string) {
  return tx.pushSubscription.findUnique({ where: { id }, select: { id: true,
    volunteerId: true, endpoint: true, p256dh: true, auth: true } });
}
export type NoticeDevice = NonNullable<Awaited<ReturnType<typeof noticeDevice>>>;

/** Device parent first; only prune the exact owner and credentials which failed. */
export function pruneNoticeDevice(original: NoticeDevice) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PushSubscription" WHERE id = ${original.id} FOR UPDATE`;
    const current = await noticeDevice(tx, original.id);
    if (!current || current.volunteerId !== original.volunteerId || current.endpoint !== original.endpoint
      || current.p256dh !== original.p256dh || current.auth !== original.auth) return;
    await tx.pushSubscription.delete({ where: { id: original.id } });
  });
}
