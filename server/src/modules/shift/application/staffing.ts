import type { LongShiftWarning, StaffingGapsResponse } from '@spoh/shared';
import { DEFAULT_SETTINGS, getSettings } from '../../../platform/settings/index.js';
import { activeShiftBlocks, startOfEventDay } from '../../../platform/time/index.js';
import {
  findEventDayId,
  listStaffedStations,
  longRunningShifts,
  staffingByStation,
} from '../data/repo.js';
import { longShiftWarnings, staffingGaps } from '../domain/staffing.js';

/**
 * Time on station without a break before the welfare list picks somebody up.
 * Three hours is the threshold from slide 39 and the shipped default; the live
 * value is a runtime setting, because how long is too long is exactly the sort
 * of thing a dry run tells you.
 */
export const LONG_SHIFT_MINUTES = DEFAULT_SETTINGS.longShiftMinutes;

/** Which stations are understaffed right now. */
export async function getStaffingGaps(now = new Date()): Promise<StaffingGapsResponse> {
  const blocks = activeShiftBlocks(now);
  const eventDayId = await findEventDayId(startOfEventDay(now));
  if (!eventDayId || blocks.length === 0) {
    // Outside event hours nothing is understaffed, because nothing is staffed.
    return { asOf: now.toISOString(), activeBlocks: blocks, gaps: [] };
  }

  const [staffing, stations] = await Promise.all([
    staffingByStation({ eventDayId, blocks }),
    listStaffedStations(),
  ]);
  return {
    asOf: now.toISOString(),
    activeBlocks: blocks,
    gaps: staffingGaps({ blocks, stations, staffing }),
  };
}

/** People on station longer than the welfare threshold, longest first. */
export async function getLongShifts(now = new Date()): Promise<LongShiftWarning[]> {
  const cutoff = new Date(now.getTime() - getSettings().longShiftMinutes * 60_000);
  return longShiftWarnings(await longRunningShifts(cutoff), now);
}
