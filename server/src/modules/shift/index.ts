/** The shift module's public API: swaps, briefing waves and staffing. */
export { shiftRouter } from './http/routes.js';
export { getLongShifts, getStaffingGaps, LONG_SHIFT_MINUTES } from './application/staffing.js';
export { readSwapNoticeSource } from './application/readNoticeSource.js';
