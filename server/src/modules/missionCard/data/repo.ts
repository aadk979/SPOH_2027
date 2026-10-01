import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { BatchRow } from '../domain/cardBatch.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { rehearsalFilter, type ReportingScope } from '../../../platform/db/rehearsalFilter.js';

/** Data access for COUNT 3 — Mission Cards. Every query names its event (ADR-001 §2). */

const cardInclude = {
  stampEvents: {
    include: { station: { select: { name: true } }, recordedBy: { select: { displayName: true } } },
    orderBy: { recordedAt: 'asc' },
  },
  redemptions: { where: { voided: false }, select: { id: true } },
} satisfies Prisma.MissionCardInclude;

export type CardWithContext = Prisma.MissionCardGetPayload<{ include: typeof cardInclude }>;

export async function findCardByShortCode(
  scope: EventScope,
  shortCode: string,
  tx: PrismaTransactionClient = prisma,
): Promise<CardWithContext | null> {
  return tx.missionCard.findUnique({
    where: { shortCode, eventId: scope.eventId },
    include: cardInclude,
  });
}

export async function findCardByQrPayload(
  scope: EventScope,
  qrPayload: string,
  tx: PrismaTransactionClient = prisma,
): Promise<CardWithContext | null> {
  return tx.missionCard.findUnique({
    where: { qrPayload, eventId: scope.eventId },
    include: cardInclude,
  });
}

export async function findCardById(
  scope: EventScope,
  id: string,
  tx: PrismaTransactionClient = prisma,
): Promise<CardWithContext | null> {
  return tx.missionCard.findUnique({ where: { id, eventId: scope.eventId }, include: cardInclude });
}

/** The bare card row, for a write that only needs its status. */
export async function findCardRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shortCode: string,
) {
  return tx.missionCard.findUnique({ where: { shortCode, eventId: scope.eventId } });
}

export async function findCardRowById(scope: EventScope, id: string) {
  return prisma.missionCard.findUnique({ where: { id, eventId: scope.eventId } });
}

/**
 * Lock the card's row for the rest of the transaction. Two scans of one card
 * then run one after the other, and the second sees the first's stamp instead
 * of colliding with it on the (card, station) unique constraint (F03-008).
 */
export async function lockCard(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shortCode: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT "id" FROM "MissionCard"
    WHERE "eventId" = ${scope.eventId} AND "shortCode" = ${shortCode}
    FOR UPDATE`;
}

/** The card with the stations it has been stamped at, for a stamp. */
export async function findCardWithStampStations(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shortCode: string,
) {
  return tx.missionCard.findUnique({
    where: { shortCode, eventId: scope.eventId },
    include: { stampEvents: { select: { stationId: true } } },
  });
}

/** A card's id and status, for the redemption cross-check. */
export async function findCardStatus(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shortCode: string,
) {
  return tx.missionCard.findUnique({
    where: { shortCode, eventId: scope.eventId },
    select: { id: true, status: true, rehearsal: true },
  });
}

/**
 * The card and every card it replaced, following reissues back to the first:
 * one journey. One gift per journey (ADR-002 §3), so the gift desk checks all
 * of them (F03-003).
 */
export async function findJourneyCardIds(
  tx: PrismaTransactionClient,
  scope: EventScope,
  cardId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE journey AS (
      SELECT "id", "reissuedFromId" FROM "MissionCard"
      WHERE "eventId" = ${scope.eventId} AND "id" = ${cardId}
      UNION
      SELECT m."id", m."reissuedFromId"
      FROM "MissionCard" m JOIN journey j ON m."id" = j."reissuedFromId"
      WHERE m."eventId" = ${scope.eventId}
    )
    SELECT "id" FROM journey`;
  return rows.map((row) => row.id);
}

/** The card with its full stamp rows, for carrying a journey to a replacement. */
export async function findCardWithStamps(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shortCode: string,
) {
  return tx.missionCard.findUnique({
    where: { shortCode, eventId: scope.eventId },
    include: { stampEvents: true },
  });
}

/**
 * Attach a card to the group registered a moment earlier at the booth. It
 * writes Registration rows, which the registration module owns, but lives
 * here: registration already imports this module to link a card at group
 * registration, and importing back would be a cycle.
 */
export async function attachGroupRegistrations(
  tx: PrismaTransactionClient,
  scope: EventScope,
  link: { groupId: string; cardId: string },
): Promise<void> {
  await tx.registration.updateMany({
    where: {
      eventId: scope.eventId,
      groupId: link.groupId,
      missionCardId: null,
      ...(await captureProvenance(tx, scope)),
    },
    data: { missionCardId: link.cardId },
  });
}

/**
 * Insert a print batch and return the rows actually inserted. A code that
 * already belongs to a card is skipped (the unique constraint on shortCode),
 * and the caller prints only what comes back (F03-022).
 */
export async function createCardBatch(
  tx: PrismaTransactionClient,
  scope: EventScope,
  rows: BatchRow[],
): Promise<BatchRow[]> {
  const created = await tx.missionCard.createManyAndReturn({
    data: rows.map((row) => ({ ...row, eventId: scope.eventId })),
    skipDuplicates: true,
    select: { shortCode: true, qrPayload: true, batchLabel: true, rehearsal: true },
  });
  return created.map((row) => ({ ...row, batchLabel: row.batchLabel ?? '' }));
}

export async function updateCard(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; data: Prisma.MissionCardUncheckedUpdateInput },
): Promise<void> {
  await tx.missionCard.update({
    where: { id: change.id, eventId: scope.eventId },
    data: change.data,
  });
}

export async function createStamp(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.CardStampEventUncheckedCreateInput, 'eventId'>,
): Promise<void> {
  await tx.cardStampEvent.create({
    data: { ...(await captureProvenance(tx, scope)), ...data, eventId: scope.eventId },
  });
}

export async function countStampsForCard(
  tx: PrismaTransactionClient,
  scope: EventScope,
  missionCardId: string,
): Promise<number> {
  return tx.cardStampEvent.count({ where: { eventId: scope.eventId, missionCardId } });
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
function issuedWhere(
  scope: ReportingScope,
  filter: CardFunnelFilter,
): Prisma.MissionCardWhereInput & EventScope {
  return {
    eventId: scope.eventId,
    ...rehearsalFilter(scope),
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

export async function countIssued(
  scope: ReportingScope,
  filter: CardFunnelFilter,
): Promise<number> {
  return prisma.missionCard.count({ where: issuedWhere(scope, filter) });
}

export async function countByStatus(
  scope: ReportingScope,
  status: Prisma.MissionCardWhereInput['status'],
  filter: CardFunnelFilter,
): Promise<number> {
  return prisma.missionCard.count({ where: { ...issuedWhere(scope, filter), status } });
}

export async function countVoided(
  scope: ReportingScope,
  filter: CardFunnelFilter,
): Promise<number> {
  return prisma.missionCard.count({ where: { ...issuedWhere(scope, filter), status: 'VOIDED' } });
}

/**
 * Distinct cards that reached each station.
 *
 * DISTINCT on the card, not a count of stamp rows: the funnel asks "how many
 * journeys reached here", and the unique constraint on (card, station) already
 * makes those the same number — this keeps them the same number if that
 * constraint ever changes.
 */
export async function countCardsPerStation(
  scope: ReportingScope,
  filter: CardFunnelFilter,
): Promise<Map<string, number>> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);

  const rows = await prisma.$queryRaw<Array<{ stationId: string; cards: bigint }>>`
    SELECT s."stationId", COUNT(DISTINCT s."missionCardId")::bigint AS cards
    FROM "CardStampEvent" s
    JOIN "MissionCard" c ON c."id" = s."missionCardId"
    WHERE s."eventId" = ${scope.eventId}
      AND c."eventId" = ${scope.eventId}
      AND (${scope.includeRehearsal ?? false} OR (s."rehearsal" = false AND c."rehearsal" = false))
      AND s."recordedAt" >= ${from} AND s."recordedAt" < ${to}
      AND c."status" <> 'LOST'
    GROUP BY s."stationId"`;

  return new Map(rows.map((row) => [row.stationId, Number(row.cards)]));
}

export async function countRedeemedCards(
  scope: ReportingScope,
  filter: CardFunnelFilter,
): Promise<number> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);

  const rows = await prisma.$queryRaw<Array<{ cards: bigint }>>`
    SELECT COUNT(DISTINCT "missionCardId")::bigint AS cards
    FROM "GiftRedemption"
    WHERE "eventId" = ${scope.eventId}
      AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false)
      AND "voided" = false
      AND "missionCardId" IS NOT NULL
      AND "recordedAt" >= ${from} AND "recordedAt" < ${to}`;

  return Number(rows[0]?.cards ?? 0);
}
