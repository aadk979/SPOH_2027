/**
 * The eventDays module's public API. Its routes are mounted under /admin by the
 * admin module's route composition (P06.4).
 */
export {
  createEventDayHandler,
  listEventDaysHandler,
  updateEventDayHandler,
} from './http/handlers.js';
export { addShiftsForDay } from './application/addShiftsForDay.js';
export { applyShiftHours } from './application/applyShiftHours.js';
export { requireEventDay } from './application/requireEventDay.js';
