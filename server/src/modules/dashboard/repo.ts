import { prisma } from '../../platform/db/client.js';

/**
 * Reads for the live dashboard (PRODUCT_BRIEF §9).
 *
 * Everything here is scoped to a single day and answers one question. They are
 * deliberately small and separate so the live payload can assemble them in
 * parallel — the dashboard is polled every three seconds and must not become
 * the most expensive thing the database does on event day.
 *
 * Every window is bounded above by `until` (the request's "now") as well as
 * below (F02-006). A fallback row typed with tomorrow's date, or copied from
 * the template's fixed date, would otherwise count as today and as the last
 * hour for as long as it sits in the future.
 */

export async function registrationsSince(since: Date, until: Date): Promise<number> {
  return prisma.registration.count({
    where: { voided: false, recordedAt: { gte: since, lte: until } },
  });
}

export async function registrationsByCategory(
  since: Date,
  until: Date,
): Promise<Array<{ key: string; value: number }>> {
  const rows = await prisma.registration.groupBy({
    by: ['category'],
    where: { voided: false, recordedAt: { gte: since, lte: until } },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({ key: row.category, value: row._count._all }))
    .sort((a, b) => b.value - a.value);
}

export async function footfallSince(since: Date, until: Date): Promise<number> {
  const result = await prisma.footfallTick.aggregate({
    where: { voided: false, recordedAt: { gte: since, lte: until } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export async function openIncidentCounts(): Promise<{ open: number; critical: number }> {
  const [open, critical] = await Promise.all([
    prisma.incident.count({ where: { status: { not: 'RESOLVED' } } }),
    prisma.incident.count({ where: { status: { not: 'RESOLVED' }, severity: 'CRITICAL' } }),
  ]);
  return { open, critical };
}

export async function activeLostPersonCount(): Promise<number> {
  return prisma.lostPersonAlert.count({ where: { status: 'ACTIVE' } });
}

export async function openFallbackWindowExists(now: Date): Promise<boolean> {
  const open = await prisma.fallbackWindow.findFirst({
    where: { startedAt: { lte: now }, endedAt: null },
    select: { id: true },
  });
  return open !== null;
}

/**
 * Volunteers checked in but recording nothing.
 *
 * A device that has gone quiet is different from a station that has: one
 * person's phone may be in a pocket while a colleague keeps counting, and the
 * station total would hide that entirely. This is the per-person view the IC
 * needs to know who to go and find.
 */
export async function checkedInWithLastCapture(input: {
  eventDayId: string;
  blocks: string[];
  since: Date;
  until: Date;
}): Promise<
  Array<{
    volunteerId: string;
    volunteerName: string;
    stationName: string;
    lastCaptureAt: Date | null;
  }>
> {
  /**
   * Scalar subqueries rather than three LEFT JOINs.
   *
   * Joining the three capture tables would produce a cartesian product per
   * volunteer — 200 registrations x 200 ticks is 40,000 rows to compute one
   * MAX from — and this runs every three seconds on the Chief's dashboard.
   *
   * GREATEST ignores NULLs and returns NULL only when every argument is NULL,
   * which is exactly the "checked in but has recorded nothing at all" case.
   */
  const rows = await prisma.$queryRaw<
    Array<{
      volunteerId: string;
      volunteerName: string;
      stationName: string;
      lastCaptureAt: Date | null;
    }>
  >`
    SELECT
      v."id"          AS "volunteerId",
      v."displayName" AS "volunteerName",
      s."name"        AS "stationName",
      GREATEST(
        (SELECT MAX(r."recordedAt") FROM "Registration"   r
          WHERE r."recordedById" = v."id"
            AND r."recordedAt" >= ${input.since} AND r."recordedAt" <= ${input.until}),
        (SELECT MAX(f."recordedAt") FROM "FootfallTick"   f
          WHERE f."recordedById" = v."id"
            AND f."recordedAt" >= ${input.since} AND f."recordedAt" <= ${input.until}),
        (SELECT MAX(c."recordedAt") FROM "CardStampEvent" c
          WHERE c."recordedById" = v."id"
            AND c."recordedAt" >= ${input.since} AND c."recordedAt" <= ${input.until})
      ) AS "lastCaptureAt"
    FROM "ShiftAssignment" a
    JOIN "Volunteer" v ON v."id" = a."volunteerId"
    JOIN "Station"   s ON s."id" = a."stationId"
    WHERE a."eventDayId" = ${input.eventDayId}
      AND a."checkedInAt" IS NOT NULL
      AND a."checkedOutAt" IS NULL`;

  return rows;
}

export async function checkedInCount(eventDayId: string): Promise<number> {
  return prisma.shiftAssignment.count({
    where: { eventDayId, checkedInAt: { not: null }, checkedOutAt: null },
  });
}

export async function onShiftCount(eventDayId: string, blocks: string[]): Promise<number> {
  return prisma.shiftAssignment.count({
    where: { eventDayId, block: { in: blocks as never[] } },
  });
}

/** Per-device registration contribution at one station, for the IC console. */
export async function registrationsByDevice(
  stationId: string,
  since: Date,
  until: Date,
): Promise<
  Array<{ volunteerId: string; volunteerName: string; value: number; firstAt: Date; lastAt: Date }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      volunteerId: string;
      volunteerName: string;
      value: bigint;
      firstAt: Date;
      lastAt: Date;
    }>
  >`
    SELECT
      v."id"          AS "volunteerId",
      v."displayName" AS "volunteerName",
      COUNT(*)::bigint AS value,
      MIN(r."recordedAt") AS "firstAt",
      MAX(r."recordedAt") AS "lastAt"
    FROM "Registration" r
    JOIN "Volunteer" v ON v."id" = r."recordedById"
    WHERE r."voided" = false AND r."stationId" = ${stationId}
      AND r."recordedAt" >= ${since} AND r."recordedAt" <= ${until}
    GROUP BY v."id", v."displayName"
    ORDER BY value DESC`;

  return rows.map((row) => ({ ...row, value: Number(row.value) }));
}

export async function footfallByDevice(
  stationId: string,
  since: Date,
  until: Date,
): Promise<Array<{ volunteerId: string; volunteerName: string; value: number; lastAt: Date }>> {
  const rows = await prisma.$queryRaw<
    Array<{ volunteerId: string; volunteerName: string; value: bigint; lastAt: Date }>
  >`
    SELECT
      v."id"          AS "volunteerId",
      v."displayName" AS "volunteerName",
      SUM(f."quantity")::bigint AS value,
      MAX(f."recordedAt")       AS "lastAt"
    FROM "FootfallTick" f
    JOIN "Volunteer" v ON v."id" = f."recordedById"
    WHERE f."voided" = false AND f."stationId" = ${stationId}
      AND f."recordedAt" >= ${since} AND f."recordedAt" <= ${until}
    GROUP BY v."id", v."displayName"
    ORDER BY value DESC`;

  return rows.map((row) => ({ ...row, value: Number(row.value) }));
}

export async function stampsAtStation(
  stationId: string,
  since: Date,
  until: Date,
): Promise<number> {
  return prisma.cardStampEvent.count({
    where: { stationId, recordedAt: { gte: since, lte: until } },
  });
}
