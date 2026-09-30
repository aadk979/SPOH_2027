import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Data access for stations. Prisma queries only: no authorization, no policy.
 * Every query names its event (ADR-001 §2) and takes the client to run on, so
 * a use case can pass its transaction; it defaults to the shared client.
 *
 * A station row comes with its type, whose flags say what happens there
 * (ADR-002), and its tags.
 */

export const WITH_TYPE = {
  type: true,
  tags: { include: { tag: true } },
} as const satisfies Prisma.StationInclude;

export type Station = Prisma.StationGetPayload<{ include: typeof WITH_TYPE }>;

const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

export async function listStations(
  scope: EventScope,
  options: { includeInactive?: boolean } = {},
  db: PrismaTransactionClient = prisma,
): Promise<Station[]> {
  return db.station.findMany({
    where: { eventId: scope.eventId, ...(options.includeInactive ? {} : { active: true }) },
    include: WITH_TYPE,
    orderBy: ORDER,
  });
}

export async function findStationById(
  scope: EventScope,
  id: string,
  db: PrismaTransactionClient = prisma,
): Promise<Station | null> {
  return db.station.findFirst({ where: { eventId: scope.eventId, id }, include: WITH_TYPE });
}

/**
 * Names of the stations with these ids, in one query, for lists that show a
 * station per row (F03-029). Inactive stations are included: a record keeps
 * naming the station it was made at.
 */
export async function findStationNames(
  scope: EventScope,
  ids: readonly string[],
  db: PrismaTransactionClient = prisma,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const stations = await db.station.findMany({
    where: { eventId: scope.eventId, id: { in: [...new Set(ids)] } },
    select: { id: true, name: true },
  });
  return new Map(stations.map((station) => [station.id, station.name]));
}

export async function findStationByCode(
  scope: EventScope,
  code: string,
  db: PrismaTransactionClient = prisma,
): Promise<Station | null> {
  return db.station.findFirst({ where: { eventId: scope.eventId, code }, include: WITH_TYPE });
}

export async function createStationRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.StationUncheckedCreateInput, 'eventId'>,
): Promise<Station> {
  return tx.station.create({ data: { ...data, eventId: scope.eventId }, include: WITH_TYPE });
}

export async function updateStationRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; data: Prisma.StationUncheckedUpdateInput },
): Promise<Station> {
  return tx.station.update({
    where: { id: change.id, eventId: scope.eventId },
    data: change.data,
    include: WITH_TYPE,
  });
}

/** Stations that stamp a Mission Card — the journey the funnel measures. */
export async function listStampingStations(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<Station[]> {
  return db.station.findMany({
    where: { eventId: scope.eventId, active: true, type: { issuesStamp: true } },
    include: WITH_TYPE,
    orderBy: ORDER,
  });
}

/** Stations whose room entries are counted — the footfall rooms. */
export async function listCountedStations(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<Station[]> {
  return db.station.findMany({
    where: { eventId: scope.eventId, active: true, type: { countsEntry: true } },
    include: WITH_TYPE,
    orderBy: ORDER,
  });
}

/** One of the event's station types by code, or null. */
export async function findTypeByCode(tx: PrismaTransactionClient, scope: EventScope, code: string) {
  return tx.stationType.findUnique({
    where: { eventId_code: { eventId: scope.eventId, code } },
    select: { id: true, code: true },
  });
}

/** The event's tags among these codes. */
export async function findTagsByCodes(
  tx: PrismaTransactionClient,
  scope: EventScope,
  codes: readonly string[],
) {
  return tx.stationTag.findMany({
    where: { eventId: scope.eventId, code: { in: [...codes] } },
    select: { id: true, code: true },
  });
}

/** A station's tags, replaced. */
export async function setTags(
  tx: PrismaTransactionClient,
  scope: EventScope,
  station: { id: string; tagIds: readonly string[] },
): Promise<void> {
  const { eventId } = scope;
  await tx.stationTagging.deleteMany({ where: { eventId, stationId: station.id } });
  await tx.stationTagging.createMany({
    data: station.tagIds.map((tagId) => ({ eventId, stationId: station.id, tagId })),
  });
}
