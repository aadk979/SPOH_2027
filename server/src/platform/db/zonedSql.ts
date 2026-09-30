import { Prisma } from '../../generated/prisma/client.js';
import type { EventZone } from '../time/index.js';

export type { EventZone };

/**
 * SQL for reading instants on an event's wall clock (ADR-007 §7, F01 time
 * audit). The zone is a bound parameter and every expression works on
 * `timestamptz` explicitly, so the result is the same whatever the database
 * session's `TimeZone` is (F01 case 12).
 */

/** The timestamp columns bucketed by reports; a closed list, never user input. */
export type InstantColumn = 'recordedAt' | 'issuedAt' | 'completedAt';

function columnOf(name: InstantColumn): Prisma.Sql {
  return Prisma.raw(`"${name}"`);
}

/**
 * Local midnight of the event day an instant belongs to, as a `timestamp`
 * (no zone): read with `toISOString().slice(0, 10)` it is the event date. The
 * day starts at the event's `dayBoundaryMinutes` (ADR-004 §3).
 */
export function eventDaySql(name: InstantColumn, zone: EventZone): Prisma.Sql {
  const column = columnOf(name);
  return Prisma.sql`date_trunc('day', (${column} AT TIME ZONE ${zone.timezone}::text)
    - make_interval(mins => ${zone.dayBoundaryMinutes}::int))`;
}

/**
 * The instant a local bucket of `minutes` starts: bins align to the event's
 * wall clock, so an hour at +05:30 starts at 09:00 local, not at 09:30, and a
 * 30-minute bin at +05:45 starts on the local half hour. The two occurrences
 * of a repeated hour stay two buckets, being two different instants.
 */
export function localBucketStartSql(
  name: InstantColumn,
  timezone: string,
  minutes: number,
): Prisma.Sql {
  const column = columnOf(name);
  const local = Prisma.sql`(${column} AT TIME ZONE ${timezone}::text)`;
  // hardcoding-allowed: the bin origin, a fixed midnight, not an event date.
  return Prisma.sql`${column} - (${local} - date_bin(make_interval(mins => ${minutes}::int), ${local}, TIMESTAMP '2000-01-01'))`;
}
