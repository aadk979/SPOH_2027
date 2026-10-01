/**
 * The eventDays module's public API. Its routes are mounted under /admin by the
 * admin module's route composition (P06.4).
 */
export {
  createEventDayHandler,
  listEventDaysHandler,
  listShiftTemplatesHandler,
  updateEventDayHandler,
  updateShiftTemplateHandler,
} from './http/handlers.js';
export { addShiftsForDay } from './application/addShiftsForDay.js';
export { requireEventDay } from './application/requireEventDay.js';
