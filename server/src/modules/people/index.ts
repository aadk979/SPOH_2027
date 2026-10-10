/**
 * The people module's public API: the roster's people as the admin screens
 * manage them, and the escalation rules every path that changes a role
 * applies. Its routes are mounted under /admin by the admin module (P06.4).
 */
export {
  deactivateVolunteerHandler,
  getVolunteerHandler,
  listVolunteersHandler,
  reactivateVolunteerHandler,
  updateVolunteerHandler,
} from './http/handlers.js';
export { outranks } from './domain/escalation.js';
export {
  bulkPeopleHandler,
  resendInviteHandler,
  signOutPersonHandler,
} from './http/lifecycleHandlers.js';
export { personRouter } from './http/personRoutes.js';
export { volunteerMutationReplay } from './http/replay.js';
export { getVolunteer } from './application/queries.js';
export { scheduleArchivedRetention } from './application/staffRetention.js';
export { peopleScheduledHandlers, peopleRecurringActions } from './jobs.js';
