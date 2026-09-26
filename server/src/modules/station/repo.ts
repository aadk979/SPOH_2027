import type { StationSummary } from '@spoh/shared';
import type { Station } from '../../generated/prisma/client.js';
import { prisma } from '../../platform/db/client.js';

/** Data access for stations. Pure persistence — no authorization, no policy. */

export function toStationSummary(station: Station): StationSummary {
  return {
    id: station.id,
    code: station.code,
    name: station.name,
    kind: station.kind,
    courseCode: station.courseCode,
    floor: station.floor,
    countsEntry: station.countsEntry,
    issuesStamp: station.issuesStamp,
    active: station.active,
    sortOrder: station.sortOrder,
  };
}

export async function listStations(
  options: { includeInactive?: boolean } = {},
): Promise<Station[]> {
  return prisma.station.findMany({
    where: options.includeInactive ? {} : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function findStationById(id: string): Promise<Station | null> {
  return prisma.station.findUnique({ where: { id } });
}

export async function findStationByCode(code: string): Promise<Station | null> {
  return prisma.station.findUnique({ where: { code } });
}

/** Stations that stamp a Mission Card — the journey the funnel measures. */
export async function listStampingStations(): Promise<Station[]> {
  return prisma.station.findMany({
    where: { active: true, issuesStamp: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/** Stations whose room entries are counted — the footfall rooms. */
export async function listCountedStations(): Promise<Station[]> {
  return prisma.station.findMany({
    where: { active: true, countsEntry: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}
