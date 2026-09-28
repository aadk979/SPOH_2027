import { Router } from 'express';
import { z } from 'zod';
import {
  CloseFallbackRequest,
  DeclareFallbackRequest,
  Id,
  ImportFootfallRequest,
  ImportRegistrationsRequest,
  TimeRangeQuery,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import {
  closeWindowHandler,
  declareWindowHandler,
  importFootfallHandler,
  importRegistrationsHandler,
  listWindowsHandler,
} from './handlers.js';

/** Fallback windows and reconciliation imports (BUILD_PLAN §7.2). */
export const fallbackRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

fallbackRouter.use(requireAuth);

/**
 * Declaring a tier is a command decision — DC and above only. Individual
 * volunteers switching systems on their own is how the same visitor ends up
 * counted in three places (PRODUCT_BRIEF §11.1).
 */
fallbackRouter.post(
  '/windows',
  defaultRateLimit,
  requireCapability('fallback.declare'),
  validate({ body: DeclareFallbackRequest }),
  declareWindowHandler,
);

fallbackRouter.post(
  '/windows/:id/close',
  defaultRateLimit,
  requireCapability('fallback.declare'),
  validate({ params: IdParams, body: CloseFallbackRequest }),
  closeWindowHandler,
);

/** Readable by anyone who can read a dashboard — it explains the numbers. */
fallbackRouter.get(
  '/windows',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: TimeRangeQuery }),
  listWindowsHandler,
);

/**
 * Imports are Chief-and-Admin only and default to a dry run. Bringing an
 * outage worth of counts into the real dataset is exactly the operation you
 * want to see the diff of first.
 */
fallbackRouter.post(
  '/imports/registrations',
  sensitiveRateLimit,
  requireCapability('fallback.import'),
  validate({ body: ImportRegistrationsRequest }),
  importRegistrationsHandler,
);

fallbackRouter.post(
  '/imports/footfall',
  sensitiveRateLimit,
  requireCapability('fallback.import'),
  validate({ body: ImportFootfallRequest }),
  importFootfallHandler,
);
