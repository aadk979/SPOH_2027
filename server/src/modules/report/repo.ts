import { prisma } from '../../lib/prisma.js';
import { singaporeHourKey } from '../../lib/time.js';

/**
 * Reads for the post-event report (PRODUCT_BRIEF §10).
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

export async function registrationTotals(range: Range) {
  const [total, voided, byCategory] = await Promise.all([
    prisma.registration.count({
      where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
    }),
    prisma.registration.count({
      where: { voided: true, recordedAt: { gte: range.from, lt: range.to } },
    }),
    prisma.registration.groupBy({
      by: ['category'],
      where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
  ]);

  return {
    total,
    voided,
    byCategory: byCategory
      .map((row) => ({ key: row.category, value: row._count._all }))
      .sort((a, b) => b.value - a.value),
  };
}

/**
 * Bucketed by Singapore day, not UTC day.
 *
 * The event runs 09:30 to 18:00 local, which is 01:30 to 10:00 UTC, so a UTC
 * bucket happens to line up here — but relying on that would break the moment
 * anything ran in the evening. `AT TIME ZONE` states the intent.
 */
export async function registrationsByDay(range: Range) {
  const rows = await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
    SELECT date_trunc('day', "recordedAt" AT TIME ZONE 'Asia/Singapore') AS date,
           COUNT(*)::bigint AS value
    FROM "Registration"
    WHERE "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY date
    ORDER BY date ASC`;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    value: Number(row.value),
  }));
}

export async function registrationsByHour(range: Range) {
  const rows = await prisma.$queryRaw<Array<{ hour: Date; value: bigint }>>`
    SELECT date_trunc('hour', "recordedAt") AS hour, COUNT(*)::bigint AS value
    FROM "Registration"
    WHERE "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY hour
    ORDER BY hour ASC`;

  // Truncation stays in UTC deliberately: Singapore is UTC+8 exactly, so the
  // hour boundaries are identical either way and doing the arithmetic in the
  // database would only move it somewhere harder to test. What was wrong was
  // the label, which is added here.
  return rows.map((row) => ({
    hour: row.hour.toISOString(),
    localHour: singaporeHourKey(row.hour).replace('T', ' ') + ':00',
    value: Number(row.value),
  }));
}

export async function footfallTotals(range: Range) {
  const result = await prisma.footfallTick.aggregate({
    where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export async function footfallBySource(range: Range) {
  const rows = await prisma.footfallTick.groupBy({
    by: ['source'],
    where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
    _sum: { quantity: true },
  });

  return rows.map((row) => ({ source: row.source, value: row._sum.quantity ?? 0 }));
}

/** 30-minute curve per station — the peak-period analysis the clicker never gave. */
export async function footfallCurve(range: Range) {
  const rows = await prisma.$queryRaw<
    Array<{ stationId: string; bucketStart: Date; value: bigint }>
  >`
    SELECT
      "stationId",
      to_timestamp(floor(extract(epoch FROM "recordedAt") / 1800) * 1800) AS "bucketStart",
      SUM("quantity")::bigint AS value
    FROM "FootfallTick"
    WHERE "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY "stationId", "bucketStart"
    ORDER BY "stationId", "bucketStart"`;

  return rows.map((row) => ({
    stationId: row.stationId,
    bucketStart: row.bucketStart,
    value: Number(row.value),
  }));
}

export async function cardTotals(range: Range) {
  const [issued, completed, voided] = await Promise.all([
    prisma.missionCard.count({
      where: { issuedAt: { gte: range.from, lt: range.to } },
    }),
    prisma.missionCard.count({
      where: { status: 'COMPLETED', completedAt: { gte: range.from, lt: range.to } },
    }),
    prisma.missionCard.count({
      where: { status: 'VOIDED', voidedAt: { gte: range.from, lt: range.to } },
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
export async function cardsByDay(range: Range, column: 'issuedAt' | 'completedAt') {
  const rows =
    column === 'issuedAt'
      ? await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
          SELECT date_trunc('day', "issuedAt" AT TIME ZONE 'Asia/Singapore') AS date,
                 COUNT(*)::bigint AS value
          FROM "MissionCard"
          WHERE "issuedAt" >= ${range.from} AND "issuedAt" < ${range.to}
          GROUP BY date ORDER BY date ASC`
      : await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
          SELECT date_trunc('day', "completedAt" AT TIME ZONE 'Asia/Singapore') AS date,
                 COUNT(*)::bigint AS value
          FROM "MissionCard"
          WHERE "completedAt" >= ${range.from} AND "completedAt" < ${range.to}
          GROUP BY date ORDER BY date ASC`;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    value: Number(row.value),
  }));
}

export async function cardsPerStation(range: Range) {
  const rows = await prisma.$queryRaw<Array<{ stationId: string; cards: bigint }>>`
    SELECT "stationId", COUNT(DISTINCT "missionCardId")::bigint AS cards
    FROM "CardStampEvent"
    WHERE "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY "stationId"`;

  return rows.map((row) => ({ stationId: row.stationId, cards: Number(row.cards) }));
}

export async function giftRedemptionsByDay(range: Range) {
  const rows = await prisma.$queryRaw<Array<{ date: Date; value: bigint }>>`
    SELECT date_trunc('day', "recordedAt" AT TIME ZONE 'Asia/Singapore') AS date,
           COUNT(*)::bigint AS value
    FROM "GiftRedemption"
    WHERE "voided" = false AND "recordedAt" >= ${range.from} AND "recordedAt" < ${range.to}
    GROUP BY date ORDER BY date ASC`;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    value: Number(row.value),
  }));
}

export async function giftRedemptionsByStation(range: Range) {
  const rows = await prisma.giftRedemption.groupBy({
    by: ['stationId'],
    where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
    _count: { _all: true },
  });

  return rows.map((row) => ({ stationId: row.stationId, value: row._count._all }));
}

export async function incidentsInRange(range: Range) {
  return prisma.incident.findMany({
    where: { reportedAt: { gte: range.from, lt: range.to } },
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
export async function lostPersonSummaries(range: Range) {
  return prisma.lostPersonSummary.findMany({
    where: { raisedAt: { gte: range.from, lt: range.to } },
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
export async function unpurgedLostPersonCount(range: Range) {
  const [total, resolved] = await Promise.all([
    prisma.lostPersonAlert.count({
      where: { raisedAt: { gte: range.from, lt: range.to }, purgedAt: null },
    }),
    prisma.lostPersonAlert.count({
      where: {
        raisedAt: { gte: range.from, lt: range.to },
        purgedAt: null,
        status: { not: 'ACTIVE' },
      },
    }),
  ]);

  return { total, resolved };
}

export async function lostFoundCounts(range: Range) {
  const rows = await prisma.lostFoundItem.groupBy({
    by: ['status'],
    where: { foundAt: { gte: range.from, lt: range.to } },
    _count: { _all: true },
  });

  const byStatus = new Map(rows.map((row) => [row.status, row._count._all]));

  return {
    logged: rows.reduce((sum, row) => sum + row._count._all, 0),
    claimed: byStatus.get('CLAIMED') ?? 0,
    unclaimed: (byStatus.get('HELD') ?? 0) + (byStatus.get('UNCLAIMED_AT_CLOSE') ?? 0),
  };
}

export async function volunteerAttendance(range: Range) {
  return prisma.shiftAssignment.findMany({
    where: { eventDay: { date: { gte: range.from, lt: range.to } } },
    select: {
      volunteerId: true,
      stationId: true,
      checkedInAt: true,
      checkedOutAt: true,
      station: { select: { name: true } },
    },
  });
}

export async function importBatches(range: Range) {
  return prisma.importBatch.findMany({
    where: { importedAt: { gte: range.from, lt: range.to } },
    orderBy: { importedAt: 'asc' },
  });
}

/** How many rows in each capture table came from each source. */
export async function recordsBySource(range: Range) {
  const [registrations, footfall, stamps, redemptions] = await Promise.all([
    prisma.registration.groupBy({
      by: ['source'],
      where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
    prisma.footfallTick.groupBy({
      by: ['source'],
      where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
      _sum: { quantity: true },
    }),
    prisma.cardStampEvent.groupBy({
      by: ['source'],
      where: { recordedAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
    prisma.giftRedemption.groupBy({
      by: ['source'],
      where: { voided: false, recordedAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
  ]);

  return [
    ...registrations.map((row) => ({
      table: 'Registration',
      source: row.source,
      value: row._count._all,
    })),
    ...footfall.map((row) => ({
      table: 'FootfallTick',
      source: row.source,
      value: row._sum.quantity ?? 0,
    })),
    ...stamps.map((row) => ({
      table: 'CardStampEvent',
      source: row.source,
      value: row._count._all,
    })),
    ...redemptions.map((row) => ({
      table: 'GiftRedemption',
      source: row.source,
      value: row._count._all,
    })),
  ];
}

export async function voidedCounts(range: Range) {
  const [registrations, footfall, redemptions] = await Promise.all([
    prisma.registration.count({
      where: { voided: true, recordedAt: { gte: range.from, lt: range.to } },
    }),
    prisma.footfallTick.count({
      where: { voided: true, recordedAt: { gte: range.from, lt: range.to } },
    }),
    prisma.giftRedemption.count({
      where: { voided: true, recordedAt: { gte: range.from, lt: range.to } },
    }),
  ]);

  return [
    { table: 'Registration', value: registrations },
    { table: 'FootfallTick', value: footfall },
    { table: 'GiftRedemption', value: redemptions },
  ];
}
