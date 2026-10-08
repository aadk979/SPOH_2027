import { authorize } from '../../../platform/http/authorize.js';
import { theEvent, fromParam } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import { Id, RehearsalInclusionQuery } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import { dataHealthHandler, liveDashboardHandler, stationDashboardHandler } from './handlers.js';

/** The live operations dashboard (BUILD_PLAN §7.2). */
export const dashboardRouter: Router = Router();

const StationIdParams = z.object({ id: Id }).strict();

dashboardRouter.use(requireAuth);

/**
 * Polled every 3 seconds by the Chief and each Deputy Coordinator. Under the
 * default rate limit rather than the capture one: 20 clients at 20 polls a
 * minute is 400 requests, comfortably inside 300 per client per minute.
 */
dashboardRouter.get(
  '/live',
  defaultRateLimit,
  authorize('Dashboard.ReadEvent', theEvent),
  requireCapability('dashboard.event.read'),
  validate({ query: RehearsalInclusionQuery }),
  liveDashboardHandler,
);

dashboardRouter.get(
  '/data-health',
  defaultRateLimit,
  authorize('Dashboard.ReadEvent', theEvent),
  requireCapability('dashboard.event.read'),
  validate({ query: RehearsalInclusionQuery }),
  dataHealthHandler,
);

dashboardRouter.get(
  '/station/:id',
  defaultRateLimit,
  authorize('Dashboard.ReadStation', fromParam('Station')),
  requireCapability('dashboard.station.read'),
  validate({ params: StationIdParams, query: RehearsalInclusionQuery }),
  stationDashboardHandler,
);
