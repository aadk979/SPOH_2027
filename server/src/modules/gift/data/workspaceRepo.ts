import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';

const redemptionSelect = { id: true, stationId: true, giftTypeId: true, missionCardId: true, recordedById: true,
  recordedAt: true, source: true, rehearsal: true, voided: true, voidedReason: true, flag: true,
  giftType: { select: { name: true } } } as const;
export function workspaceGift(context: ReadDatabase, id: string) {
  return context.db.giftType.findFirst({ where: { eventId: context.scope.eventId, id },
    select: { id: true, name: true, initialStock: true, rehearsalInitialStock: true, active: true, lowStockThreshold: true } });
}
export function workspaceRedemptionStation(context: ReadDatabase, id: string) {
  return context.db.giftRedemption.findFirst({ where: { eventId: context.scope.eventId, id }, select: { stationId: true } });
}
export function workspaceRedemption(context: ReadDatabase, id: string) {
  return context.db.giftRedemption.findFirst({ where: { eventId: context.scope.eventId, id }, select: redemptionSelect });
}
export async function workspaceRedemptions(context: ReadDatabase, input: {
  where: Prisma.GiftRedemptionWhereInput; cursor?: string; limit: number;
}) {
  const anchor = input.cursor ? await context.db.giftRedemption.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, recordedAt: true } }) : null;
  const count = await (context.db.giftRedemption.count({ where: input.where }));
  const rows = await (context.db.giftRedemption.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.recordedAt } : null, 'recordedAt')] }, select: redemptionSelect,
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export function workspaceGiftSearch(context: ReadDatabase, input: { query: string; limit: number }) {
  return context.db.giftType.findMany({ where: { eventId: context.scope.eventId, name: { contains: input.query, mode: 'insensitive' } },
    select: { id: true, name: true, active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: input.limit + 1 });
}
export async function workspaceGiftTotals(context: ReadDatabase, input: { giftTypeId: string; rehearsal: boolean; asOf: Date }) {
  const where = { eventId: context.scope.eventId, giftTypeId: input.giftTypeId, rehearsal: input.rehearsal };
  const redemptions = await (context.db.giftRedemption.count({ where: { ...where, voided: false, recordedAt: { lte: input.asOf } } }));
  const adjustments = await (context.db.giftStockAdjustment.aggregate({ where: { ...where, createdAt: { lte: input.asOf } }, _sum: { delta: true } }));
  return { redemptions, adjustment: adjustments._sum.delta ?? 0 };
}
