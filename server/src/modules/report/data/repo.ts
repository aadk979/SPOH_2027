import { prisma } from '../../../platform/db/client.js';
import { rehearsalFilter, type ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import { eventDaySql, localBucketStartSql, type EventZone } from '../../../platform/db/zonedSql.js';

/**
 * Reads for the post-event report (PRODUCT_BRIEF §10), for one event (ADR-001 §2).
 *
 * Every aggregate here is bounded by an explicit time range, and every one that
 * touches a capture table filters `voided: false` — a voided row stays for the
 * audit trail and must never appear in a count.
 *
 * These run once, at the end, not every three seconds. Correctness and clarity
 * beat cleverness; where raw SQL is used it is because Postgres can bucket and
 * Prisma cannot.
 */

export interface Range {
  from: Date;
  to: Date;
}

export async function registrationTotals(scope: ReportingScope, range: Range) {
  const [total, voided, byCategory, categories] = await Promise.all([
    prisma.registration.count({
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        voided: false,
        recordedAt: { gte: range.from, lt: range.to },
      },
    }),
    prisma.registration.count({
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        voided: true,
        recordedAt: { gte: range.from, lt: range.to },
      },
    }),
    prisma.registration.groupBy({
      by: ['categoryId'],
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        voided: false,
        recordedAt: { gte: range.from, lt: range.to },
      },
      _count: { _all: true },
    }),
    prisma.captureCategory.findMany({
      where: { eventId: scope.eventId },
      select: { id: true, code: true, label: true },
    }),
  ]);

  // Grouped by the event's own categories, named as the event names them (P09.12).
  const byId = new Map(categories.map((category) => [category.id, category]));
  return {
    total,
    voided,
    byCategory: byCategory
      .flatMap((row) => {
        const category = row.categoryId ? byId.get(row.categoryId) : undefined;
        return category
          ? [{ key: category.code, label: category.label, value: row._count._all }]
          : [];
      })
      .sort((a, b) => b.value - a.value),
  };
}

/**
 * Bucketed by event day in the event's timezone, from its day boundary
 * (ADR-004 §3), never by UTC day: an evening session would otherwise land on
 * the wrong date.
 */
export async function registrationsByDay(scope: ReportingScope, range: Range, zone: EventZone) {
  const rows = await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
    SELECT ${eventDaySql('recordedAt', zone)} AS date,
           COUNT(*)::bigint AS value
    FROM "Registration"
    WHERE "eventId" = ${scope.eventId} AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false) AND "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY date
    ORDER BY date ASC`;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    value: Number(row.value),
  }));
}

/**
 * By local hour: the bucket starts on the event's wall-clock hour, which is
 * not a UTC hour at +05:30. The label is added by the report section.
 */
export async function registrationsByHour(scope: ReportingScope, range: Range, timezone: string) {
  const rows = await prisma.$queryRaw<Array<{ hour: Date; value: bigint }>>`
    SELECT ${localBucketStartSql('recordedAt', timezone, 60)} AS hour, COUNT(*)::bigint AS value
    FROM "Registration"
    WHERE "eventId" = ${scope.eventId} AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false) AND "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY hour
    ORDER BY hour ASC`;

  return rows.map((row) => ({ hour: row.hour, value: Number(row.value) }));
}

export async function footfallTotals(scope: ReportingScope, range: Range) {
  const result = await prisma.footfallTick.aggregate({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      voided: false,
      recordedAt: { gte: range.from, lt: range.to },
    },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export async function footfallBySource(scope: ReportingScope, range: Range) {
  const rows = await prisma.footfallTick.groupBy({
    by: ['source'],
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      voided: false,
      recordedAt: { gte: range.from, lt: range.to },
    },
    _sum: { quantity: true },
  });

  return rows.map((row) => ({ source: row.source, value: row._sum.quantity ?? 0 }));
}

/**
 * 30-minute curve per station — the peak-period analysis the clicker never
 * gave — on the event's local half hours.
 */
export async function footfallCurve(scope: ReportingScope, range: Range, timezone: string) {
  const rows = await prisma.$queryRaw<
    Array<{ stationId: string; bucketStart: Date; value: bigint }>
  >`
    SELECT
      "stationId",
      ${localBucketStartSql('recordedAt', timezone, 30)} AS "bucketStart",
      SUM("quantity")::bigint AS value
    FROM "FootfallTick"
    WHERE "eventId" = ${scope.eventId} AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false) AND "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY "stationId", "bucketStart"
    ORDER BY "stationId", "bucketStart"`;

  return rows.map((row) => ({
    stationId: row.stationId,
    bucketStart: row.bucketStart,
    value: Number(row.value),
  }));
}

export async function cardTotals(scope: ReportingScope, range: Range) {
  const [issued, completed, voided] = await Promise.all([
    // A lost original's journey continues on its replacement (ADR-002 §3).
    prisma.missionCard.count({
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        issuedAt: { gte: range.from, lt: range.to },
        status: { not: 'LOST' },
      },
    }),
    prisma.missionCard.count({
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        status: 'COMPLETED',
        completedAt: { gte: range.from, lt: range.to },
      },
    }),
    prisma.missionCard.count({
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        status: 'VOIDED',
        voidedAt: { gte: range.from, lt: range.to },
      },
    }),
  ]);

  return { issued, completed, voided };
}

/**
 * Issued and completed split by day, separately.
 *
 * These do not have to agree: a card issued on 6 January and completed on
 * 8 January is one journey spanning two days, because Sec 4 students keep their
 * stamps and return (PRODUCT_BRIEF §0.5). A single per-day completion rate
 * would misread that badly, so the report shows both series.
 */
export async function cardsByDay(
  scope: ReportingScope,
  range: Range,
  by: { column: 'issuedAt' | 'completedAt'; zone: EventZone },
) {
  const day = eventDaySql(by.column, by.zone);
  const rows =
    by.column === 'issuedAt'
      ? await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
          SELECT ${day} AS date,
                 COUNT(*)::bigint AS value
          FROM "MissionCard"
          WHERE "eventId" = ${scope.eventId} AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false) AND "issuedAt" >= ${range.from} AND "issuedAt" < ${range.to}
            AND "status" <> 'LOST'
          GROUP BY date ORDER BY date ASC`
      : await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
          SELECT ${day} AS date,
                 COUNT(*)::bigint AS value
          FROM "MissionCard"
          WHERE "eventId" = ${scope.eventId} AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false) AND "completedAt" >= ${range.from} AND "completedAt" < ${range.to}
          GROUP BY date ORDER BY date ASC`;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    value: Number(row.value),
  }));
}

export async function cardsPerStation(scope: ReportingScope, range: Range) {
  const rows = await prisma.$queryRaw<Array<{ stationId: string; cards: bigint }>>`
    SELECT s."stationId", COUNT(DISTINCT s."missionCardId")::bigint AS cards
    FROM "CardStampEvent" s
    JOIN "MissionCard" c ON c."id" = s."missionCardId"
    WHERE s."eventId" = ${scope.eventId} AND c."eventId" = ${scope.eventId} AND (${scope.includeRehearsal ?? false} OR (s."rehearsal" = false AND c."rehearsal" = false)) AND s."recordedAt" >= ${range.from} AND s."recordedAt" < ${range.to}
      AND c."status" <> 'LOST'
    GROUP BY s."stationId"`;

  return rows.map((row) => ({ stationId: row.stationId, cards: Number(row.cards) }));
}

export async function giftRedemptionsByDay(scope: ReportingScope, range: Range, zone: EventZone) {
  const rows = await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
    SELECT ${eventDaySql('recordedAt', zone)} AS date,
           COUNT(*)::bigint AS value
    FROM "GiftRedemption"
    WHERE "eventId" = ${scope.eventId} AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false) AND "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY date ORDER BY date ASC`;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    value: Number(row.value),
  }));
}

export async function giftRedemptionsByStation(scope: ReportingScope, range: Range) {
  const rows = await prisma.giftRedemption.groupBy({
    by: ['stationId'],
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      voided: false,
      recordedAt: { gte: range.from, lt: range.to },
    },
    _count: { _all: true },
  });

  return rows.map((row) => ({ stationId: row.stationId, value: row._count._all }));
}

export async function giftRedemptionsByType(scope: ReportingScope, range: Range) {
  return prisma.giftRedemption.groupBy({
    by: ['giftTypeId', 'rehearsal'],
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      voided: false,
      recordedAt: { gte: range.from, lt: range.to },
    },
    _count: { _all: true },
  });
}

export async function incidentsInRange(scope: ReportingScope, range: Range) {
  return prisma.incident.findMany({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      reportedAt: { gte: range.from, lt: range.to },
    },
    include: {
      station: { select: { name: true } },
      _count: { select: { followUps: true } },
    },
    orderBy: { reportedAt: 'asc' },
  });
}

/**
 * Lost-person figures come from `LostPersonSummary` and nowhere else.
 *
 * The alert descriptions are nulled 24 hours after resolution, and no report is
 * permitted to read them even before that (BUILD_PLAN §5.9). What goes in the
 * report is "3 cases, all resolved, median 7 minutes".
 */
export async function lostPersonSummaries(scope: ReportingScope, range: Range) {
  return prisma.lostPersonSummary.findMany({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      raisedAt: { gte: range.from, lt: range.to },
    },
    select: { resolutionMinutes: true, outcome: true },
  });
}

/**
 * Alerts raised in the range that have not yet been purged.
 *
 * Counted, never read. Immediately after the event most cases will still be
 * inside the 24-hour retention window, and a report that said "0 cases" because
 * the purge had not run yet would be wrong in the most alarming possible way.
 */
export async function unpurgedLostPersonCount(scope: ReportingScope, range: Range) {
  const [total, resolved] = await Promise.all([
    prisma.lostPersonAlert.count({
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        raisedAt: { gte: range.from, lt: range.to },
        purgedAt: null,
      },
    }),
    prisma.lostPersonAlert.count({
      where: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        raisedAt: { gte: range.from, lt: range.to },
        purgedAt: null,
        status: { not: 'ACTIVE' },
      },
    }),
  ]);

  return { total, resolved };
}

export async function lostFoundCounts(scope: ReportingScope, range: Range) {
  const rows = await prisma.lostFoundItem.groupBy({
    by: ['status'],
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      foundAt: { gte: range.from, lt: range.to },
    },
    _count: { _all: true },
  });

  const byStatus = new Map(rows.map((row) => [row.status, row._count._all]));

  return {
    logged: rows.reduce((sum, row) => sum + row._count._all, 0),
    claimed: byStatus.get('CLAIMED') ?? 0,
    unclaimed: (byStatus.get('HELD') ?? 0) + (byStatus.get('UNCLAIMED_AT_CLOSE') ?? 0),
  };
}

export async function volunteerAttendance(scope: ReportingScope, range: Range) {
  return prisma.shiftAssignment.findMany({
    where: { eventId: scope.eventId, eventDay: { date: { gte: range.from, lt: range.to } } },
    select: {
      volunteerId: true,
      stationId: true,
      checkedInAt: true,
      checkedOutAt: true,
      station: { select: { name: true } },
      shift: { select: { endsAt: true } },
    },
  });
}

/** The event's active members. */
export async function countActiveVolunteers(scope: ReportingScope): Promise<number> {
  return prisma.eventMembership.count({ where: { eventId: scope.eventId, status: 'ACTIVE' } });
}
