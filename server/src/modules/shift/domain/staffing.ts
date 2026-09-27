import type { LongShiftWarning, StaffingGap } from '@spoh/shared';
import { minutesBetween } from '../../../platform/time/index.js';

/**
 * Which stations are understaffed, per running block. Three distinct problems,
 * because they need three different responses: nobody rostered at all,
 * everyone rostered but nobody arrived, and some but not all of the team.
 */
interface StaffingRow {
  stationId: string;
  block: unknown;
  assigned: number;
  checkedIn: number;
}

/** The gap at one station in one block, or null when everyone rostered is there. */
function gapAt(
  station: { id: string; name: string },
  block: string,
  row: StaffingRow | undefined,
): StaffingGap | null {
  const assigned = row?.assigned ?? 0;
  const checkedIn = row?.checkedIn ?? 0;
  if (assigned > 0 && checkedIn === assigned) return null;
  return {
    stationId: station.id,
    stationName: station.name,
    block: block as StaffingGap['block'],
    assigned,
    checkedIn,
    missing: Math.max(0, assigned - checkedIn),
    severity: assigned === 0 ? 'UNSTAFFED' : checkedIn === 0 ? 'NOBODY_CHECKED_IN' : 'PARTIAL',
  };
}

export function staffingGaps(input: {
  blocks: readonly string[];
  stations: ReadonlyArray<{ id: string; name: string }>;
  staffing: readonly StaffingRow[];
}): StaffingGap[] {
  return input.blocks.flatMap((block) =>
    input.stations.flatMap((station) => {
      const row = input.staffing.find((s) => s.stationId === station.id && s.block === block);
      const gap = gapAt(station, block, row);
      return gap ? [gap] : [];
    }),
  );
}

/**
 * One warning per person, not per assignment. The blocks overlap and nothing
 * auto-checks-out, so someone who works through the handover has two open
 * assignments; the earliest check-in is how long they have actually stood there.
 */
export function longShiftWarnings(
  rows: ReadonlyArray<{
    volunteerId: string;
    checkedInAt: Date | null;
    volunteer: { displayName: string };
    station: { name: string };
  }>,
  now: Date,
): LongShiftWarning[] {
  const byVolunteer = new Map<string, LongShiftWarning>();
  for (const row of rows) {
    if (row.checkedInAt === null) continue;
    const warning: LongShiftWarning = {
      volunteerId: row.volunteerId,
      volunteerName: row.volunteer.displayName,
      stationName: row.station.name,
      checkedInAt: row.checkedInAt.toISOString(),
      minutesOnStation: minutesBetween(row.checkedInAt, now),
    };
    const existing = byVolunteer.get(row.volunteerId);
    if (!existing || warning.minutesOnStation > existing.minutesOnStation) {
      byVolunteer.set(row.volunteerId, warning);
    }
  }
  return [...byVolunteer.values()].sort((a, b) => b.minutesOnStation - a.minutesOnStation);
}
