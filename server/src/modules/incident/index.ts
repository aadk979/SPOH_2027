/** The incident module's public API: the only file another module may import. */
export { incidentRouter } from './http/routes.js';
export { readIncidentNoticeSource } from './application/readNoticeSource.js';
export { incidentWorkspaceSource } from './application/workspace.js';
