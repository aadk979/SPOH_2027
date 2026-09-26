import type { StationSummary } from '@spoh/shared';
import type { Station } from '../../../generated/prisma/client.js';

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
