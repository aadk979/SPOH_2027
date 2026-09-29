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

/** The capabilities a station of the old shape had (F01 § P01.3). */
export interface LegacyStationShape {
  kind: string;
  countsEntry: boolean;
  issuesStamp: boolean;
}

/**
 * Expand phase (P09.5 to P09.10): stations are still created and edited by
 * kind and flags, so the type is found, or made, from them, exactly as the
 * Event #1 migration derived it.
 */
export async function typeIdFor(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shape: LegacyStationShape,
): Promise<string> {
  const code = `${shape.kind}${shape.countsEntry ? '_COUNTED' : ''}${shape.issuesStamp ? '_STAMPED' : ''}`;
  const label = shape.kind.toLowerCase().replace(/_/g, ' ');
  const type = await tx.stationType.upsert({
    where: { eventId_code: { eventId: scope.eventId, code } },
    create: {
      eventId: scope.eventId,
      code,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      registersVisitors: shape.kind === 'SIGNUP_BOOTH',
      redeemsGifts: shape.kind === 'MISSION_COMPLETE',
      countsEntry: shape.countsEntry,
      issuesStamp: shape.issuesStamp,
    },
    update: {},
    select: { id: true },
  });
  return type.id;
}

/** Expand phase: a station's course becomes its only tag. */
export async function setCourseTag(
  tx: PrismaTransactionClient,
  scope: EventScope,
  station: { id: string; courseCode: string | null },
): Promise<void> {
  const { eventId } = scope;
  await tx.stationTagging.deleteMany({ where: { eventId, stationId: station.id } });
  if (!station.courseCode) return;
  const tag = await tx.stationTag.upsert({
    where: { eventId_code: { eventId, code: station.courseCode } },
    create: { eventId, code: station.courseCode, label: station.courseCode },
    update: {},
    select: { id: true },
  });
  await tx.stationTagging.create({ data: { eventId, stationId: station.id, tagId: tag.id } });
}
