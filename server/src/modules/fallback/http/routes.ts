import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import { theEvent, anyStation, self } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import {
  CloseFallbackRequest,
  DeclareFallbackRequest,
  Id,
  ImportFootfallRequest,
  ImportRegistrationsRequest,
  TimeRangeQuery,
  UndoCaptureImportRequest,
  ConfirmOutboxSalvageRequest,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  closeWindowHandler,
  declareWindowHandler,
  importFootfallHandler,
  importRegistrationsHandler,
  listWindowsHandler,
  undoImportHandler,
  confirmSalvageHandler,
} from './handlers.js';

/** Fallback windows and reconciliation imports (BUILD_PLAN §7.2). */
export const fallbackRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

fallbackRouter.use(requireAuth);
fallbackRouter.post('/imports/:id/undo', sensitiveRateLimit, authorize('Fallback.Import', theEvent),
  validate({ params: IdParams, body: UndoCaptureImportRequest }), idempotent('POST /fallback/imports/:id/undo'),
  undoImportHandler);
fallbackRouter.post('/salvage/confirm', sensitiveRateLimit, authorize('Self.Read', self),
  validate({ body: ConfirmOutboxSalvageRequest }), idempotent('POST /fallback/salvage/confirm'), confirmSalvageHandler);

/**
 * Declaring a tier is a command decision — DC and above only. Individual
 * volunteers switching systems on their own is how the same visitor ends up
 * counted in three places (PRODUCT_BRIEF §11.1).
 */
fallbackRouter.post(
  '/windows',
  defaultRateLimit,
  authorize('Fallback.Declare', theEvent),
  validate({ body: DeclareFallbackRequest }),
  declareWindowHandler,
);

fallbackRouter.post(
  '/windows/:id/close',
  defaultRateLimit,
  authorize('Fallback.Declare', theEvent),
  validate({ params: IdParams, body: CloseFallbackRequest }),
  closeWindowHandler,
);

/** Readable by anyone who can read a dashboard — it explains the numbers. */
fallbackRouter.get(
  '/windows',
  defaultRateLimit,
  authorizeAll('Dashboard.ReadStation', anyStation('Dashboard.ReadStation'), { any: true }),
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
  authorize('Fallback.Import', theEvent),
  validate({ body: ImportRegistrationsRequest }),
  importRegistrationsHandler,
);

fallbackRouter.post(
  '/imports/footfall',
  sensitiveRateLimit,
  authorize('Fallback.Import', theEvent),
  validate({ body: ImportFootfallRequest }),
  importFootfallHandler,
);
