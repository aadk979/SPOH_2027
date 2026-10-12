import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
export function redemptionReference(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  return tx.giftRedemption.findFirst({ where: { eventId: scope.eventId, id },
    select: { id: true, giftTypeId: true, missionCardId: true, rehearsal: true } });
}
export async function lockRedemption(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  await tx.$queryRaw`SELECT id FROM "GiftRedemption" WHERE "eventId" = ${scope.eventId} AND id = ${id} FOR UPDATE`;
}
export async function lockRedemptionCard(tx: PrismaTransactionClient, scope: EventScope, id: string | null) {
  if (id) await tx.$queryRaw`SELECT id FROM "MissionCard" WHERE "eventId" = ${scope.eventId} AND id = ${id} FOR UPDATE`;
}
export function retainedRedemption(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  return tx.giftRedemption.findFirst({ where: { eventId: scope.eventId, id },
    select: { id: true, giftTypeId: true, missionCardId: true, rehearsal: true, voided: true, source: true } });
}
export function markRedemptionVoid(tx: PrismaTransactionClient, scope: EventScope,
  input: { id: string; reason: string; now: Date }) {
  return tx.giftRedemption.update({ where: { eventId: scope.eventId, id: input.id },
    data: { voided: true, voidedAt: input.now, voidedReason: input.reason } });
}
export async function redemptionPoolTotals(tx: PrismaTransactionClient, scope: EventScope,
  input: { giftTypeId: string; rehearsal: boolean }) {
  const where = { eventId: scope.eventId, giftTypeId: input.giftTypeId, rehearsal: input.rehearsal };
  const redeemed = await tx.giftRedemption.count({ where: { ...where, voided: false } });
  const adjustments = await tx.giftStockAdjustment.aggregate({ where, _sum: { delta: true } });
  return { rehearsal: input.rehearsal, redeemed, adjustment: adjustments._sum.delta ?? 0 };
}
