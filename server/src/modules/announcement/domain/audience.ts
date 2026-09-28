import type { CommitteeRole } from '@spoh/shared';

/**
 * Who an announcement reaches: one rule for the inbox, the reach count and the
 * urgent push (F03-014). They used to disagree — the push took every role at
 * or above the target plus everyone at the station, the count matched the
 * station on any day — so people were woken by a push for a message their
 * inbox did not show, and the sender was told a smaller number.
 *
 * - role: exactly that role; none means every role.
 * - station: rostered at that station today; none means anyone.
 * - event day: rostered today, on that day; none means any day.
 *
 * The data layer renders the same rule as two queries (the reader's inbox, and
 * the audience's ids); this function states it for the tests and the
 * acknowledgement check.
 */
export interface Audience {
  role: CommitteeRole | null;
  stationId: string | null;
  eventDayId: string | null;
}

export interface Reader {
  role: CommitteeRole;
  /** Stations and event days of the reader's shifts today. */
  todaysStationIds: readonly string[];
  todaysEventDayIds: readonly string[];
}

export function reaches(audience: Audience, reader: Reader): boolean {
  if (audience.role && audience.role !== reader.role) return false;
  if (audience.stationId && !reader.todaysStationIds.includes(audience.stationId)) return false;
  if (audience.eventDayId && !reader.todaysEventDayIds.includes(audience.eventDayId)) return false;
  return true;
}

export function audienceOf(announcement: {
  targetRole: CommitteeRole | null;
  targetStationId: string | null;
  targetEventDayId: string | null;
}): Audience {
  return {
    role: announcement.targetRole,
    stationId: announcement.targetStationId,
    eventDayId: announcement.targetEventDayId,
  };
}
