import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function giftNoticeStationIds(scope: EventScope, db: PrismaTransactionClient) {
  return db.station.findMany({ where: { eventId: scope.eventId }, select: { id: true } });
}
export async function giftNoticeMetadata(scope: EventScope, input: { db: PrismaTransactionClient; id: string }) {
  const gift = await input.db.giftType.findFirst({ where: { eventId: scope.eventId, id: input.id },
    select: { id: true, name: true, initialStock: true, lowStockThreshold: true, active: true } });
  if (!gift) return null;
  const count = await input.db.giftRedemption.count({ where: { eventId: scope.eventId,
    giftTypeId: gift.id, rehearsal: false, voided: false } });
  const adjustment = await input.db.giftStockAdjustment.aggregate({ where: { eventId: scope.eventId,
    giftTypeId: gift.id, rehearsal: false }, _sum: { delta: true } });
  return { ...gift, remaining: gift.initialStock + (adjustment._sum.delta ?? 0) - count };
}
export async function giftNoticeTransition(scope: EventScope, input: {
  db: PrismaTransactionClient; giftId: string; id: string; type: 'REDEMPTION' | 'ADJUSTMENT';
}) {
  const where = { eventId: scope.eventId, giftTypeId: input.giftId, id: input.id, rehearsal: false };
  const row = input.type === 'REDEMPTION'
    ? await input.db.giftRedemption.findFirst({ where: { ...where, voided: false }, select: { id: true } })
    : await input.db.giftStockAdjustment.findFirst({ where, select: { id: true } });
  return !!row;
}
