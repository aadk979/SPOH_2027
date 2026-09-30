import { ShiftBlock, type LongShiftWarning, type StaffingGapsResponse } from '@spoh/shared';
import { DEFAULT_SETTINGS, getSettings } from '../../../platform/settings/index.js';
import { runningShifts } from '../../../platform/event/runningShifts.js';
import { eventTodayStart } from '../../../platform/event/today.js';
import {
  listStaffedStations,
  longRunningShifts,
  runningShiftCodes,
  staffingByStation,
} from '../data/repo.js';
import { longShiftWarnings, staffingGaps } from '../domain/staffing.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Time on station without a break before the welfare list picks somebody up.
 * Three hours is the threshold from slide 39 and the shipped default; the live
 * value is a runtime setting, because how long is too long is exactly the sort
 * of thing a dry run tells you.
 */
export const LONG_SHIFT_MINUTES = DEFAULT_SETTINGS.longShiftMinutes;

/** Which stations are understaffed right now. */
/** The shifts on duty now, by the template codes the grid is keyed on. */
async function blocksOnDuty(scope: EventScope, running: Awaited<ReturnType<typeof runningShifts>>) {
  const codes = await runningShiftCodes(scope, running);
  return codes.flatMap((code) => {
    const block = ShiftBlock.safeParse(code);
    return block.success ? [block.data] : [];
  });
}

export async function getStaffingGaps(
  scope: EventScope,
  now = new Date(),
): Promise<StaffingGapsResponse> {
  const running = await runningShifts(scope, now);
  const blocks = await blocksOnDuty(scope, running);
  if (blocks.length === 0) {
    // Outside event hours nothing is understaffed, because nothing is staffed.
    return { asOf: now.toISOString(), activeBlocks: blocks, gaps: [] };
  }

  const [staffing, stations] = await Promise.all([
    staffingByStation(scope, running),
    listStaffedStations(scope),
  ]);
  return {
    asOf: now.toISOString(),
    activeBlocks: blocks,
    gaps: staffingGaps({ blocks, stations, staffing }),
  };
}

/** People on station longer than the welfare threshold, longest first. */
export async function getLongShifts(
  scope: EventScope,
  now = new Date(),
): Promise<LongShiftWarning[]> {
  const cutoff = new Date(now.getTime() - getSettings().longShiftMinutes * 60_000);
  const since = await eventTodayStart(scope, now);
  return longShiftWarnings(await longRunningShifts(scope, { cutoff, since }), now);
}
