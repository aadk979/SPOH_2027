/** The event module's public API: the only file another module may import. */
export { eventListRouter } from './http/routes.js';
export { createEvent, type NewEvent } from './application/createEvent.js';
export { getEventSummary } from './application/getEventSummary.js';
export type { EventTaxonomy } from './data/repo.js';
