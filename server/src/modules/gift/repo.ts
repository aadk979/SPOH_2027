import type { GiftTypeRecord } from '@spoh/shared';
import type { GiftType, Prisma } from '../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../lib/prisma.js';

/**
 * Data access for gifts (PRODUCT_BRIEF §5).
 *
 * Stock is DERIVED on every read: initialStock + adjustments − unvoided
 * redemptions. There is deliberately no `remaining` column. A stored counter
 * would drift the first time a redemption was voided or an import ran, and the
 * number on the screen at the Mission Complete desk has to be the number the
 * redemption log actually implies.
 */

export interface GiftTotals {
  redeemed: number;
  adjustment: number;
}

export function toGiftTypeRecord(gift: GiftType, totals: GiftTotals): GiftTypeRecord {
  const remaining = gift.initialStock + totals.adjustment - totals.redeemed;

  return {
    id: gift.id,
    name: gift.name,
    initialStock: gift.initialStock,
    lowStockThreshold: gift.lowStockThreshold,
    active: gift.active,
    remaining,
    redeemed: totals.redeemed,
    adjustment: totals.adjustment,
    lowStock: remaining <= gift.lowStockThreshold,
    outOfStock: remaining <= 0,
  };
}

export async function listGiftTypes(includeInactive = false): Promise<GiftType[]> {
  return prisma.giftType.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' },
  });
}

export async function findGiftType(
  id: string,
  tx: PrismaTransactionClient = prisma,
): Promise<GiftType | null> {
  return tx.giftType.findUnique({ where: { id } });
}

/** Redemption and adjustment totals for every gift type, in two queries. */
export async function giftTotals(
  tx: PrismaTransactionClient = prisma,
): Promise<Map<string, GiftTotals>> {
  const [redemptions, adjustments] = await Promise.all([
    tx.giftRedemption.groupBy({
      by: ['giftTypeId'],
      where: { voided: false },
      _count: { _all: true },
    }),
    tx.giftStockAdjustment.groupBy({ by: ['giftTypeId'], _sum: { delta: true } }),
  ]);

  const totals = new Map<string, GiftTotals>();

  for (const row of redemptions) {
    totals.set(row.giftTypeId, { redeemed: row._count._all, adjustment: 0 });
  }

  for (const row of adjustments) {
    const existing = totals.get(row.giftTypeId) ?? { redeemed: 0, adjustment: 0 };
    totals.set(row.giftTypeId, { ...existing, adjustment: row._sum.delta ?? 0 });
  }

  return totals;
}

export async function totalsForGiftType(
  tx: PrismaTransactionClient,
  giftTypeId: string,
): Promise<GiftTotals> {
  const [redeemed, adjustment] = await Promise.all([
    tx.giftRedemption.count({ where: { giftTypeId, voided: false } }),
    tx.giftStockAdjustment.aggregate({ where: { giftTypeId }, _sum: { delta: true } }),
  ]);

  return { redeemed, adjustment: adjustment._sum.delta ?? 0 };
}

export async function createRedemption(
  tx: PrismaTransactionClient,
  data: Prisma.GiftRedemptionUncheckedCreateInput,
) {
  return tx.giftRedemption.create({ data });
}

export async function createAdjustment(
  tx: PrismaTransactionClient,
  data: Prisma.GiftStockAdjustmentUncheckedCreateInput,
): Promise<void> {
  await tx.giftStockAdjustment.create({ data });
}

/** Has this card already been given a gift? Warns on a duplicate presentation. */
export async function existingRedemptionForCard(
  tx: PrismaTransactionClient,
  missionCardId: string,
): Promise<{ id: string } | null> {
  return tx.giftRedemption.findFirst({
    where: { missionCardId, voided: false },
    select: { id: true },
  });
}

export interface GiftSummaryFilter {
  stationId?: string;
  from?: Date;
  to?: Date;
}

export async function summariseRedemptions(
  filter: GiftSummaryFilter,
): Promise<Array<{ giftTypeId: string; count: number }>> {
  const rows = await prisma.giftRedemption.groupBy({
    by: ['giftTypeId'],
    where: {
      voided: false,
      ...(filter.stationId ? { stationId: filter.stationId } : {}),
      ...(filter.from || filter.to
        ? {
            recordedAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    },
    _count: { _all: true },
  });

  return rows.map((row) => ({ giftTypeId: row.giftTypeId, count: row._count._all }));
}
