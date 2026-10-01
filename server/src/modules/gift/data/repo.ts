import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { GiftType, Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Data access for gifts (PRODUCT_BRIEF §5). Every query names its event
 * (ADR-001 §2).
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
  rehearsal?: boolean;
}

export async function listGiftTypes(
  scope: EventScope,
  includeInactive = false,
  db: PrismaTransactionClient = prisma,
): Promise<GiftType[]> {
  return db.giftType.findMany({
    where: { eventId: scope.eventId, ...(includeInactive ? {} : { active: true }) },
    orderBy: { name: 'asc' },
  });
}

/**
 * Lock the gift type's row for the rest of the transaction, so simultaneous
 * redemptions of one gift read the stock one after the other and the last
 * one cannot be handed out twice (F03-007).
 */
export async function lockGiftType(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT "id" FROM "GiftType" WHERE "eventId" = ${scope.eventId} AND "id" = ${id} FOR UPDATE`;
}

export async function findGiftType(
  scope: EventScope,
  id: string,
  tx: PrismaTransactionClient = prisma,
): Promise<GiftType | null> {
  return tx.giftType.findUnique({ where: { id, eventId: scope.eventId } });
}

/** Redemption and adjustment totals for every gift type, in two queries. */
export async function giftTotals(
  scope: EventScope & { rehearsal?: boolean },
  tx: PrismaTransactionClient = prisma,
): Promise<Map<string, GiftTotals>> {
  const rehearsal = scope.rehearsal ?? (await captureProvenance(tx, scope)).rehearsal;
  const redemptions = await tx.giftRedemption.groupBy({
    by: ['giftTypeId'],
    where: { eventId: scope.eventId, rehearsal, voided: false },
    _count: { _all: true },
  });
  const adjustments = await tx.giftStockAdjustment.groupBy({
    by: ['giftTypeId'],
    where: { eventId: scope.eventId, rehearsal },
    _sum: { delta: true },
  });

  const totals = new Map<string, GiftTotals>();

  for (const row of redemptions) {
    totals.set(row.giftTypeId, { redeemed: row._count._all, adjustment: 0, rehearsal });
  }

  for (const row of adjustments) {
    const existing = totals.get(row.giftTypeId) ?? { redeemed: 0, adjustment: 0, rehearsal };
    totals.set(row.giftTypeId, { ...existing, adjustment: row._sum.delta ?? 0 });
  }

  return totals;
}

export async function totalsForGiftType(
  tx: PrismaTransactionClient,
  scope: EventScope,
  giftTypeId: string,
): Promise<GiftTotals> {
  const { eventId } = scope;
  const { rehearsal } = await captureProvenance(tx, scope);
  const redeemed = await tx.giftRedemption.count({
    where: { eventId, giftTypeId, rehearsal, voided: false },
  });
  const adjustment = await tx.giftStockAdjustment.aggregate({
    where: { eventId, giftTypeId, rehearsal },
    _sum: { delta: true },
  });
  return { redeemed, adjustment: adjustment._sum.delta ?? 0, rehearsal };
}

export async function createRedemption(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.GiftRedemptionUncheckedCreateInput, 'eventId'>,
) {
  return tx.giftRedemption.create({
    data: { ...data, eventId: scope.eventId, ...(await captureProvenance(tx, scope)) },
  });
}

export async function createAdjustment(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.GiftStockAdjustmentUncheckedCreateInput, 'eventId'>,
): Promise<void> {
  await tx.giftStockAdjustment.create({
    data: { ...data, eventId: scope.eventId, ...(await captureProvenance(tx, scope)) },
  });
}

/** Has any of these cards (one journey) already been given a gift? */
export async function existingRedemptionForCards(
  tx: PrismaTransactionClient,
  scope: EventScope,
  missionCardIds: readonly string[],
): Promise<{ id: string } | null> {
  return tx.giftRedemption.findFirst({
    where: { eventId: scope.eventId, missionCardId: { in: [...missionCardIds] }, voided: false },
    select: { id: true },
  });
}

export interface GiftSummaryFilter {
  stationId?: string;
  from?: Date;
  to?: Date;
}

export async function summariseRedemptions(
  scope: EventScope,
  filter: GiftSummaryFilter,
): Promise<Array<{ giftTypeId: string; count: number }>> {
  const rows = await prisma.giftRedemption.groupBy({
    by: ['giftTypeId'],
    where: {
      eventId: scope.eventId,
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

export async function findGiftTypeByName(
  scope: EventScope,
  name: string,
): Promise<GiftType | null> {
  return prisma.giftType.findUnique({
    where: { eventId_name: { eventId: scope.eventId, name } },
  });
}

export async function createGiftTypeRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.GiftTypeUncheckedCreateInput, 'eventId'>,
): Promise<GiftType> {
  return tx.giftType.create({ data: { ...data, eventId: scope.eventId } });
}

export async function updateGiftTypeRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; data: Prisma.GiftTypeUncheckedUpdateInput },
): Promise<GiftType> {
  return tx.giftType.update({
    where: { id: change.id, eventId: scope.eventId },
    data: change.data,
  });
}
