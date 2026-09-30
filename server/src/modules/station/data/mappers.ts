import type { StationSummary, UpdateStationRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { Station } from './repo.js';

/** A station's type as the API returns it: what happens there (ADR-002). */
function toTypeSummary(station: Station): StationSummary['type'] {
  const { type } = station;
  return {
    id: type.id,
    code: type.code,
    label: type.label,
    registersVisitors: type.registersVisitors,
    countsEntry: type.countsEntry,
    issuesStamp: type.issuesStamp,
    redeemsGifts: type.redeemsGifts,
  };
}

/** A station row as the API returns it. */
export function toStationSummary(station: Station): StationSummary {
  return {
    id: station.id,
    code: station.code,
    name: station.name,
    type: toTypeSummary(station),
    tags: station.tags.map(({ tag }) => ({ id: tag.id, code: tag.code, label: tag.label })),
    floor: station.floor,
    active: station.active,
    sortOrder: station.sortOrder,
  };
}

const PATCHABLE = ['name', 'floor', 'sortOrder', 'active'] as const satisfies ReadonlyArray<
  keyof UpdateStationRequest
>;

/** Fields a patch may clear by sending null. */
const CLEARABLE: ReadonlySet<string> = new Set(['floor']);

/** The patch as a row update: only the fields the request names. */
export function toStationUpdate(patch: UpdateStationRequest): Prisma.StationUncheckedUpdateInput {
  const update: Record<string, unknown> = {};
  for (const field of PATCHABLE) {
    const value = patch[field];
    if (value !== undefined) update[field] = CLEARABLE.has(field) ? (value ?? null) : value;
  }
  return update as Prisma.StationUncheckedUpdateInput;
}
