/** The event module's public API: the only file another module may import. */
export { eventListRouter } from './http/routes.js';
export { renameEventHandler } from './http/handlers.js';
export { eventLifecycleRouter } from './http/lifecycleRoutes.js';
export { eventScheduledHandlers } from './jobs.js';
export { createEvent, type NewEvent } from './application/createEvent.js';
export { getEventSummary } from './application/getEventSummary.js';
export { planClone, type ClonePlan } from './application/planClone.js';
export { applyClone } from './application/applyClone.js';
export type { EventTaxonomy } from './data/repo.js';
