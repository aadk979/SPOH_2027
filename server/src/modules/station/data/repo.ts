import type { Station } from '../../../generated/prisma/client.js';
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
