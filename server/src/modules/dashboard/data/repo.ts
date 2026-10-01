import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma } from '../../../platform/db/client.js';
import { rehearsalFilter, type ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import { SHIFT_REF_SELECT } from '../../../platform/db/shiftRef.js';

/**
 * Reads for the live dashboard (PRODUCT_BRIEF §9), in the event the request
 * works in (ADR-001 §2).
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

export interface Window {
  since: Date;
  until: Date;
}

const within = (window: Window) => ({ gte: window.since, lte: window.until });

export async function registrationsSince(scope: ReportingScope, window: Window): Promise<number> {
  return prisma.registration.count({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      voided: false,
      recordedAt: within(window),
    },
  });
}

/** Counts per category, read through the event's categories (P09.5). */
async function countByCategory(
  scope: ReportingScope,
  where: Prisma.RegistrationWhereInput,
): Promise<Array<{ key: string; label: string; value: number }>> {
  const [rows, categories] = await Promise.all([
    prisma.registration.groupBy({
      by: ['categoryId'],
      where: { ...where, eventId: scope.eventId, ...rehearsalFilter(scope) },
      _count: { _all: true },
    }),
    prisma.captureCategory.findMany({
      where: { eventId: scope.eventId },
      select: { id: true, code: true, label: true },
    }),
  ]);
  const byId = new Map(categories.map((category) => [category.id, category]));
  return rows
    .flatMap((row) => {
      const category = row.categoryId ? byId.get(row.categoryId) : undefined;
      return category
        ? [{ key: category.code, label: category.label, value: row._count._all }]
        : [];
    })
    .sort((a, b) => b.value - a.value);
}

export async function registrationsByCategory(scope: ReportingScope, window: Window) {
  return countByCategory(scope, { voided: false, recordedAt: within(window) });
}

export async function openIncidentCounts(
  scope: ReportingScope,
): Promise<{ open: number; critical: number }> {
  const { eventId } = scope;
  const [open, critical] = await Promise.all([
    prisma.incident.count({
      where: { eventId, ...rehearsalFilter(scope), status: { not: 'RESOLVED' } },
    }),
    prisma.incident.count({
      where: {
        eventId,
        ...rehearsalFilter(scope),
        status: { not: 'RESOLVED' },
        severity: 'CRITICAL',
      },
    }),
  ]);
  return { open, critical };
}

export async function activeLostPersonCount(scope: ReportingScope): Promise<number> {
  return prisma.lostPersonAlert.count({
    where: { eventId: scope.eventId, ...rehearsalFilter(scope), status: 'ACTIVE' },
  });
}

export async function openFallbackWindowExists(scope: ReportingScope, now: Date): Promise<boolean> {
  const open = await prisma.fallbackWindow.findFirst({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      startedAt: { lte: now },
      endedAt: null,
    },
    select: { id: true },
  });
  return open !== null;
}

/** Is any shift of the event running: are we within event hours? */
export async function anyShiftRunning(
  scope: ReportingScope,
  running: Prisma.ShiftWhereInput,
): Promise<boolean> {
  const shift = await prisma.shift.findFirst({
    where: { eventId: scope.eventId, ...running },
    select: { id: true },
  });
  return shift !== null;
}

/**
 * Volunteers checked in but recording nothing.
 *
 * A device that has gone quiet is different from a station that has: one
 * person's phone may be in a pocket while a colleague keeps counting, and the
 * station total would hide that entirely. This is the per-person view the IC
 * needs to know who to go and find.
 */
export async function checkedInWithLastCapture(
  scope: ReportingScope,
  input: Window & { eventDayId: string },
): Promise<
  Array<{
    volunteerId: string;
    volunteerName: string;
    stationName: string;
    lastCaptureAt: Date | null;
  }>
> {
  const { eventId } = scope;
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
          WHERE r."eventId" = ${eventId} AND r."recordedById" = v."id"
            AND (${scope.includeRehearsal ?? false} OR r."rehearsal" = false)
            AND r."recordedAt" >= ${input.since} AND r."recordedAt" <= ${input.until}),
        (SELECT MAX(f."recordedAt") FROM "FootfallTick"   f
          WHERE f."eventId" = ${eventId} AND f."recordedById" = v."id"
            AND (${scope.includeRehearsal ?? false} OR f."rehearsal" = false)
            AND f."recordedAt" >= ${input.since} AND f."recordedAt" <= ${input.until}),
        (SELECT MAX(c."recordedAt") FROM "CardStampEvent" c
          WHERE c."eventId" = ${eventId} AND c."recordedById" = v."id"
            AND (${scope.includeRehearsal ?? false} OR c."rehearsal" = false)
            AND c."recordedAt" >= ${input.since} AND c."recordedAt" <= ${input.until})
      ) AS "lastCaptureAt"
    FROM "ShiftAssignment" a
    JOIN "Person" v ON v."id" = a."volunteerId"
    JOIN "Station"   s ON s."id" = a."stationId"
    WHERE a."eventId" = ${eventId}
      AND a."eventDayId" = ${input.eventDayId}
      AND a."checkedInAt" IS NOT NULL
      AND a."checkedOutAt" IS NULL`;

  return rows;
}

export async function checkedInCount(scope: ReportingScope, eventDayId: string): Promise<number> {
  return prisma.shiftAssignment.count({
    where: { eventId: scope.eventId, eventDayId, checkedInAt: { not: null }, checkedOutAt: null },
  });
}

/** Everyone rostered on a shift running now. */
export async function onShiftCount(
  scope: ReportingScope,
  running: Prisma.ShiftWhereInput,
): Promise<number> {
  return prisma.shiftAssignment.count({ where: { eventId: scope.eventId, shift: running } });
}

/** Per-device registration contribution at one station, for the IC console. */
export async function registrationsByDevice(
  scope: ReportingScope,
  stationId: string,
  window: Window,
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
    JOIN "Person" v ON v."id" = r."recordedById"
    WHERE r."eventId" = ${scope.eventId}
      AND (${scope.includeRehearsal ?? false} OR r."rehearsal" = false)
      AND r."voided" = false AND r."stationId" = ${stationId}
      AND r."recordedAt" >= ${window.since} AND r."recordedAt" <= ${window.until}
    GROUP BY v."id", v."displayName"
    ORDER BY value DESC`;

  return rows.map((row) => ({ ...row, value: Number(row.value) }));
}

export async function footfallByDevice(
  scope: ReportingScope,
  stationId: string,
  window: Window,
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
    JOIN "Person" v ON v."id" = f."recordedById"
    WHERE f."eventId" = ${scope.eventId}
      AND (${scope.includeRehearsal ?? false} OR f."rehearsal" = false)
      AND f."voided" = false AND f."stationId" = ${stationId}
      AND f."recordedAt" >= ${window.since} AND f."recordedAt" <= ${window.until}
    GROUP BY v."id", v."displayName"
    ORDER BY value DESC`;

  return rows.map((row) => ({ ...row, value: Number(row.value) }));
}

export async function stampsAtStation(
  scope: ReportingScope,
  stationId: string,
  window: Window,
): Promise<number> {
  return prisma.cardStampEvent.count({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      stationId,
      recordedAt: within(window),
    },
  });
}

export async function findEventDayOn(scope: ReportingScope, date: Date) {
  return prisma.eventDay.findFirst({
    where: { eventId: scope.eventId, date },
    select: { id: true, label: true },
  });
}

/** Who is rostered at a station on a day, with their check-in state. */
export async function stationRoster(scope: ReportingScope, stationId: string, day: Date) {
  return prisma.shiftAssignment.findMany({
    where: { eventId: scope.eventId, stationId, eventDay: { date: day } },
    select: {
      id: true,
      volunteerId: true,
      roleLabel: true,
      checkedInAt: true,
      checkedOutAt: true,
      volunteer: { select: { displayName: true } },
      shift: { select: SHIFT_REF_SELECT },
    },
    orderBy: [{ roleLabel: 'asc' }, { shift: { startsAt: 'asc' } }],
  });
}

/** A station's live registrations by category over a range. */
export async function stationRegistrationsByCategory(
  scope: ReportingScope,
  stationId: string,
  window: Window,
) {
  return countByCategory(scope, { stationId, voided: false, recordedAt: within(window) });
}
