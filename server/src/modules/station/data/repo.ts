import type { Prisma, Station } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/**
 * Data access for stations. Prisma queries only: no authorization, no policy.
 * Each query takes the client to run on, so a use case can pass its
 * transaction; it defaults to the shared client for plain reads.
 */

export type { Station };

const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

export async function listStations(
  options: { includeInactive?: boolean } = {},
  db: PrismaTransactionClient = prisma,
): Promise<Station[]> {
  return db.station.findMany({
    where: options.includeInactive ? {} : { active: true },
    orderBy: ORDER,
  });
}

export async function findStationById(
  id: string,
  db: PrismaTransactionClient = prisma,
): Promise<Station | null> {
  return db.station.findUnique({ where: { id } });
}

/**
 * Names of the stations with these ids, in one query, for lists that show a
 * station per row (F03-029). Inactive stations are included: a record keeps
 * naming the station it was made at.
 */
export async function findStationNames(
  ids: readonly string[],
  db: PrismaTransactionClient = prisma,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const stations = await db.station.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, name: true },
  });
  return new Map(stations.map((station) => [station.id, station.name]));
}

export async function findStationByCode(
  code: string,
  db: PrismaTransactionClient = prisma,
): Promise<Station | null> {
  return db.station.findUnique({ where: { code } });
}

export async function createStationRow(
  tx: PrismaTransactionClient,
  data: Prisma.StationCreateInput,
): Promise<Station> {
  return tx.station.create({ data });
}

export async function updateStationRow(
  tx: PrismaTransactionClient,
  change: { id: string; data: Prisma.StationUpdateInput },
): Promise<Station> {
  return tx.station.update({ where: { id: change.id }, data: change.data });
}

/** Stations that stamp a Mission Card — the journey the funnel measures. */
export async function listStampingStations(
  db: PrismaTransactionClient = prisma,
): Promise<Station[]> {
  return db.station.findMany({ where: { active: true, issuesStamp: true }, orderBy: ORDER });
}

/** Stations whose room entries are counted — the footfall rooms. */
export async function listCountedStations(
  db: PrismaTransactionClient = prisma,
): Promise<Station[]> {
  return db.station.findMany({ where: { active: true, countsEntry: true }, orderBy: ORDER });
}
