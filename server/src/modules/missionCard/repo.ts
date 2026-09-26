import type { MissionCardRecord } from '@spoh/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../platform/db/client.js';

/** Data access for COUNT 3 — Mission Cards. */

const cardInclude = {
  stampEvents: {
    include: { station: { select: { name: true } }, recordedBy: { select: { displayName: true } } },
    orderBy: { recordedAt: 'asc' },
  },
  redemptions: { where: { voided: false }, select: { id: true } },
} satisfies Prisma.MissionCardInclude;

export type CardWithContext = Prisma.MissionCardGetPayload<{ include: typeof cardInclude }>;

export function toMissionCardRecord(
  card: CardWithContext,
  stampingStationIds: readonly string[],
): MissionCardRecord {
  const visited = new Set(card.stampEvents.map((stamp) => stamp.stationId));

  return {
    id: card.id,
    shortCode: card.shortCode,
    status: card.status,
    issuedAt: card.issuedAt?.toISOString() ?? null,
    completedAt: card.completedAt?.toISOString() ?? null,
    voidedAt: card.voidedAt?.toISOString() ?? null,
    reissuedFromId: card.reissuedFromId,
    batchLabel: card.batchLabel,
    stamps: card.stampEvents.map((stamp) => ({
      id: stamp.id,
      stationId: stamp.stationId,
      stationName: stamp.station.name,
      recordedAt: stamp.recordedAt.toISOString(),
      recordedByName: stamp.recordedBy.displayName,
      source: stamp.source,
    })),
    // What the facilitator needs to tell the visitor: where to go next.
    remainingStationIds: stampingStationIds.filter((id) => !visited.has(id)),
    redeemed: card.redemptions.length > 0,
  };
}

export async function findCardByShortCode(
  shortCode: string,
  tx: PrismaTransactionClient = prisma,
): Promise<CardWithContext | null> {
  return tx.missionCard.findUnique({ where: { shortCode }, include: cardInclude });
}

export async function findCardById(
  id: string,
  tx: PrismaTransactionClient = prisma,
): Promise<CardWithContext | null> {
  return tx.missionCard.findUnique({ where: { id }, include: cardInclude });
}

export async function createCardBatch(
  rows: Array<{ shortCode: string; qrPayload: string; batchLabel: string }>,
): Promise<number> {
  // skipDuplicates because short codes are random: a collision in a 5000-card
  // batch is vanishingly unlikely but not impossible, and losing one card off a
  // print run is better than failing the whole batch.
  const result = await prisma.missionCard.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export async function updateCard(
  tx: PrismaTransactionClient,
  id: string,
  data: Prisma.MissionCardUncheckedUpdateInput,
): Promise<void> {
  await tx.missionCard.update({ where: { id }, data });
}

export async function createStamp(
  tx: PrismaTransactionClient,
  data: Prisma.CardStampEventUncheckedCreateInput,
): Promise<void> {
  await tx.cardStampEvent.create({ data });
}

export async function countStampsForCard(
  tx: PrismaTransactionClient,
  missionCardId: string,
): Promise<number> {
  return tx.cardStampEvent.count({ where: { missionCardId } });
}

export interface CardFunnelFilter {
  from?: Date;
  to?: Date;
}

function issuedWhere(filter: CardFunnelFilter): Prisma.MissionCardWhereInput {
  return {
    status: { not: 'UNISSUED' },
    ...(filter.from || filter.to
      ? {
          issuedAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : { issuedAt: { not: null } }),
  };
}

export async function countIssued(filter: CardFunnelFilter): Promise<number> {
  return prisma.missionCard.count({ where: issuedWhere(filter) });
}

export async function countByStatus(
  status: Prisma.MissionCardWhereInput['status'],
  filter: CardFunnelFilter,
): Promise<number> {
  return prisma.missionCard.count({ where: { ...issuedWhere(filter), status } });
}

export async function countVoided(filter: CardFunnelFilter): Promise<number> {
  return prisma.missionCard.count({ where: { ...issuedWhere(filter), status: 'VOIDED' } });
}

/**
 * Distinct cards that reached each station.
 *
 * DISTINCT on the card, not a count of stamp rows: the funnel asks "how many
 * journeys reached here", and the unique constraint on (card, station) already
 * makes those the same number — this keeps them the same number if that
 * constraint ever changes.
 */
export async function countCardsPerStation(filter: CardFunnelFilter): Promise<Map<string, number>> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);

  const rows = await prisma.$queryRaw<Array<{ stationId: string; cards: bigint }>>`
    SELECT "stationId", COUNT(DISTINCT "missionCardId")::bigint AS cards
    FROM "CardStampEvent"
    WHERE "recordedAt" >= ${from} AND "recordedAt" < ${to}
    GROUP BY "stationId"`;

  return new Map(rows.map((row) => [row.stationId, Number(row.cards)]));
}

export async function countRedeemedCards(filter: CardFunnelFilter): Promise<number> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);

  const rows = await prisma.$queryRaw<Array<{ cards: bigint }>>`
    SELECT COUNT(DISTINCT "missionCardId")::bigint AS cards
    FROM "GiftRedemption"
    WHERE "voided" = false
      AND "missionCardId" IS NOT NULL
      AND "recordedAt" >= ${from} AND "recordedAt" < ${to}`;

  return Number(rows[0]?.cards ?? 0);
}
