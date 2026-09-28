import type { StationSummary, UpdateStationRequest } from '@spoh/shared';
import type { Prisma, Station } from '../../../generated/prisma/client.js';

/** A station row as the API returns it. */
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

const PATCHABLE = [
  'name',
  'kind',
  'courseCode',
  'floor',
  'countsEntry',
  'issuesStamp',
  'sortOrder',
  'active',
] as const satisfies ReadonlyArray<keyof UpdateStationRequest>;

/** Fields a patch may clear by sending null. */
const CLEARABLE: ReadonlySet<string> = new Set(['courseCode', 'floor']);

/** The patch as a row update: only the fields the request names. */
export function toStationUpdate(patch: UpdateStationRequest): Prisma.StationUpdateInput {
  const update: Record<string, unknown> = {};
  for (const field of PATCHABLE) {
    const value = patch[field];
    if (value !== undefined) update[field] = CLEARABLE.has(field) ? (value ?? null) : value;
  }
  return update as Prisma.StationUpdateInput;
}
