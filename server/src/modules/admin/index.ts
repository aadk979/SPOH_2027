/**
 * The admin module is route composition only (P06.4): the /admin/* URLs, each
 * with its middleware chain, mounted over the handlers of the modules that own
 * the work — people, assignments, station, eventDays, gift and settings.
 */
export { adminRouter } from './http/routes.js';
