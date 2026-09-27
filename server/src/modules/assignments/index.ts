/**
 * The assignments module's public API: who is rostered where. Its routes are
 * mounted by the admin and roster route groups (P06.4).
 */
export {
  createAssignmentHandler,
  deleteAssignmentHandler,
  stationRosterHandler,
} from './http/handlers.js';
export { toAssignmentRecord } from './data/mappers.js';
