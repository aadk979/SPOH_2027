import { Router } from 'express';
import { EntityQuery, RecordsQuery, SearchQuery } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import type { WorkspaceSources } from '../application/readWorkspace.js';
import { workspaceHandlers } from './handlers.js';

/** Composite source-read enforcement chooses real Cedar actions in each source facade. */
export function createWorkspaceRouter(sources: WorkspaceSources) {
  const router = Router();
  const handlers = workspaceHandlers(sources);
  router.use(requireAuth, defaultRateLimit, (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.get('/entity', validate({ query: EntityQuery }), handlers.entity);
  router.get('/records', validate({ query: RecordsQuery }), handlers.records);
  router.get('/search', validate({ query: SearchQuery }), handlers.search);
  return router;
}
