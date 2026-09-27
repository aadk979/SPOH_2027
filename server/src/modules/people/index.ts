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
