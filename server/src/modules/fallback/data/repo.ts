import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { rehearsalFilter, type ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

/**
 * Fallback-window awareness (PRODUCT_BRIEF §11.4).
 *
 * Declaring, closing and importing from fallback windows is Phase 4 work. What
 * exists now is the read every summary endpoint needs: does this time range
 * overlap a period of degraded operation? A report that quietly mixes app data
 * and paper estimates without saying so is worse than one that says "this hour
 * is approximate", so the flag ships with the counts from the start rather than
 * being retrofitted once the importers exist.
 */
export async function rangeOverlapsFallbackWindow(
  scope: ReportingScope,
  range: { from?: Date; to?: Date; stationId?: string },
): Promise<boolean> {
  const from = range.from ?? new Date(0);
  const to = range.to ?? new Date(8.64e15);

  const overlapping = await prisma.fallbackWindow.findFirst({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      startedAt: { lt: to },
      AND: [
        // An open window (endedAt null) extends to now, so it overlaps anything
        // that starts before the present.
        { OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
        // A window declared for one station does not taint another station's
        // data; an event-wide window (stationId null) taints everything.
        ...(range.stationId ? [{ OR: [{ stationId: null }, { stationId: range.stationId }] }] : []),
      ],
    },
    select: { id: true },
  });

  return overlapping !== null;
}

export interface WindowRow {
  id: string;
  tier: number;
  startedAt: Date;
  endedAt: Date | null;
  stationId: string | null;
  declaredById: string;
  reason: string;
  rehearsal: boolean;
}

export async function findOpenWindow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  stationId: string | null,
) {
  return tx.fallbackWindow.findFirst({
    where: {
      eventId: scope.eventId,
      endedAt: null,
      stationId,
      ...(await captureProvenance(tx, scope)),
    },
    select: { id: true },
  });
}

export async function createWindow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: {
    tier: number;
    startedAt: Date;
    stationId: string | null;
    declaredById: string;
    reason: string;
  },
): Promise<WindowRow> {
  return tx.fallbackWindow.create({
    data: {
      ...data,
      ...(await captureProvenance(tx, scope)),
      eventId: scope.eventId,
      declaredByMembershipId: await membershipIdOf(tx, scope, data.declaredById),
    },
  });
}

export async function findWindow(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  return tx.fallbackWindow.findUnique({ where: { id, eventId: scope.eventId } });
}

export async function endWindow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  end: { id: string; endedAt: Date },
): Promise<WindowRow> {
  return tx.fallbackWindow.update({
    where: { id: end.id, eventId: scope.eventId },
    data: { endedAt: end.endedAt },
  });
}

export async function endRehearsalWindows(
  tx: PrismaTransactionClient,
  scope: EventScope,
  now: Date,
) {
  const windows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "FallbackWindow" SET "endedAt" = ${now}
    WHERE "eventId" = ${scope.eventId} AND rehearsal = true AND "endedAt" IS NULL RETURNING id`;
  return windows.map((window) => window.id);
}

export async function listWindows(
  scope: EventScope,
  range: { from?: Date; to?: Date; rehearsal?: boolean },
): Promise<WindowRow[]> {
  return prisma.fallbackWindow.findMany({
    where: {
      eventId: scope.eventId,
      ...(range.rehearsal === undefined ? {} : { rehearsal: range.rehearsal }),
      ...(range.to ? { startedAt: { lt: range.to } } : {}),
      ...(range.from ? { OR: [{ endedAt: null }, { endedAt: { gt: range.from } }] } : {}),
    },
    orderBy: { startedAt: 'asc' },
  });
}

/**
 * `declaredById` and `stationId` are plain scalars with no Prisma relation
 * (see the note at the top of schema.prisma), so names are looked up by id.
 */
export async function findVolunteerNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.person.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, displayName: true },
  });
  return new Map(rows.map((row) => [row.id, row.displayName]));
}

/** Station ids by upper-cased code: how a sheet names a station. */
export async function stationIdsByCode(scope: EventScope): Promise<Map<string, string>> {
  const stations = await prisma.station.findMany({
    where: { eventId: scope.eventId },
    select: { id: true, code: true },
  });
  return new Map(stations.map((station) => [station.code.toUpperCase(), station.id]));
}

/** The event's categories by code, for placing imported rows. */
export async function categoryIdsByCode(scope: EventScope): Promise<Map<string, string>> {
  const categories = await prisma.captureCategory.findMany({
    where: { eventId: scope.eventId },
    select: { id: true, code: true },
  });
  return new Map(categories.map((category) => [category.code, category.id]));
}

export async function existingRegistrationKeys(
  scope: EventScope,
  keys: string[],
): Promise<Set<string>> {
  const rows = await prisma.registration.findMany({
    where: { eventId: scope.eventId, idempotencyKey: { in: keys } },
    select: { idempotencyKey: true },
  });
  return new Set(rows.map((row) => row.idempotencyKey as string));
}

export async function existingFootfallKeys(
  scope: EventScope,
  keys: string[],
): Promise<Set<string>> {
  const rows = await prisma.footfallTick.findMany({
    where: { eventId: scope.eventId, idempotencyKey: { in: keys } },
    select: { idempotencyKey: true },
  });
  return new Set(rows.map((row) => row.idempotencyKey as string));
}

/** Inserts what is not already there; returns how many rows were written. */
export async function insertRegistrations(
  tx: PrismaTransactionClient,
  scope: EventScope,
  rows: Array<Omit<Prisma.RegistrationCreateManyInput, 'eventId'>>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const { count } = await tx.registration.createMany({
    data: rows.map((row) => ({ ...row, eventId: scope.eventId })),
    skipDuplicates: true,
  });
  return count;
}

export async function insertFootfall(
  tx: PrismaTransactionClient,
  scope: EventScope,
  rows: Array<Omit<Prisma.FootfallTickCreateManyInput, 'eventId'>>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const { count } = await tx.footfallTick.createMany({
    data: rows.map((row) => ({ ...row, eventId: scope.eventId })),
    skipDuplicates: true,
  });
  return count;
}

export async function createImportBatch(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: {
    rehearsal: boolean;
    source: 'FALLBACK_SHEET' | 'PAPER';
    targetTable: string;
    rowCount: number;
    fileName: string | null;
    importedById: string;
    importedByMembershipId: string;
    notes: string | null;
  },
): Promise<{ id: string }> {
  return tx.importBatch.create({
    data: { ...data, eventId: scope.eventId },
    select: { id: true },
  });
}
