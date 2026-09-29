import type { MeResponse } from '@spoh/shared';

/**
 * The station the IC console opens on: the IC's current one, or else the next
 * one they are rostered on, so an IC between blocks is not handed an empty
 * console to fill in on every visit (F02-011).
 */
export function defaultStationId(me: MeResponse | undefined): string | undefined {
  return me?.currentAssignment?.station.id ?? me?.upcomingAssignments[0]?.station.id;
}
