import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/** Data access for COUNT 3 — Mission Cards. */

const cardInclude = {
  stampEvents: {
    include: { station: { select: { name: true } }, recordedBy: { select: { displayName: true } } },
    orderBy: { recordedAt: 'asc' },
  },
  redemptions: { where: { voided: false }, select: { id: true } },
} satisfies Prisma.MissionCardInclude;

export type CardWithContext = Prisma.MissionCardGetPayload<{ include: typeof cardInclude }>;

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

/** The bare card row, for a write that only needs its status. */
export async function findCardRow(tx: PrismaTransactionClient, shortCode: string) {
  return tx.missionCard.findUnique({ where: { shortCode } });
}

export async function findCardRowById(id: string) {
  return prisma.missionCard.findUnique({ where: { id } });
}

/**
 * Lock the card's row for the rest of the transaction. Two scans of one card
 * then run one after the other, and the second sees the first's stamp instead
 * of colliding with it on the (card, station) unique constraint (F03-008).
 */
export async function lockCard(tx: PrismaTransactionClient, shortCode: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "MissionCard" WHERE "shortCode" = ${shortCode} FOR UPDATE`;
}

/** The card with the stations it has been stamped at, for a stamp. */
export async function findCardWithStampStations(tx: PrismaTransactionClient, shortCode: string) {
  return tx.missionCard.findUnique({
    where: { shortCode },
    include: { stampEvents: { select: { stationId: true } } },
  });
}

/** A card's id and status, for the redemption cross-check. */
export async function findCardStatus(tx: PrismaTransactionClient, shortCode: string) {
  return tx.missionCard.findUnique({ where: { shortCode }, select: { id: true, status: true } });
}

/**
 * The card and every card it replaced, following reissues back to the first:
 * one journey. One gift per journey (ADR-002 §3), so the gift desk checks all
 * of them (F03-003).
 */
export async function findJourneyCardIds(
  tx: PrismaTransactionClient,
  cardId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE journey AS (
      SELECT "id", "reissuedFromId" FROM "MissionCard" WHERE "id" = ${cardId}
      UNION
      SELECT m."id", m."reissuedFromId"
      FROM "MissionCard" m JOIN journey j ON m."id" = j."reissuedFromId"
    )
    SELECT "id" FROM journey`;
  return rows.map((row) => row.id);
}

/** The card with its full stamp rows, for carrying a journey to a replacement. */
export async function findCardWithStamps(tx: PrismaTransactionClient, shortCode: string) {
  return tx.missionCard.findUnique({ where: { shortCode }, include: { stampEvents: true } });
}

/**
 * Attach a card to the group registered a moment earlier at the booth. It
 * writes Registration rows, which the registration module owns, but lives
 * here: registration already imports this module to link a card at group
 * registration, and importing back would be a cycle.
 */
export async function attachGroupRegistrations(
  tx: PrismaTransactionClient,
  link: { groupId: string; cardId: string },
): Promise<void> {
  await tx.registration.updateMany({
    where: { groupId: link.groupId, missionCardId: null },
    data: { missionCardId: link.cardId },
  });
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

/**
 * Cards that stand for a journey: issued, and not an original that was lost
 * and reissued. The replacement carries the original's issue time and stamps,
 * so each chain of reissues counts once (ADR-002 §3, F03-028).
 */
function issuedWhere(filter: CardFunnelFilter): Prisma.MissionCardWhereInput {
  return {
    status: { notIn: ['UNISSUED', 'LOST'] },
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
    SELECT s."stationId", COUNT(DISTINCT s."missionCardId")::bigint AS cards
    FROM "CardStampEvent" s
    JOIN "MissionCard" c ON c."id" = s."missionCardId"
    WHERE s."recordedAt" >= ${from} AND s."recordedAt" < ${to}
      AND c."status" <> 'LOST'
    GROUP BY s."stationId"`;

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
