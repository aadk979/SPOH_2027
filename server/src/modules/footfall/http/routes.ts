import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  fromParam,
  stationFromBody,
  anyStation,
} from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import {
  CreateFootfallBulkRequest,
  CreateFootfallTickRequest,
  FootfallSummaryQuery,
  Id,
  RehearsalInclusionQuery,
  VoidFootfallTickRequest,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import {
  liveFootfallHandler,
  recordBulkHandler,
  recordTickHandler,
  summariseFootfallHandler,
  voidTickHandler,
} from './handlers.js';

/** COUNT 2 — the clicker replacement (BUILD_PLAN §7.2). */
export const footfallRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

footfallRouter.use(requireAuth);

footfallRouter.post(
  '/ticks',
  captureRateLimit,
  authorize('Footfall.Create', stationFromBody),
  validate({ body: CreateFootfallTickRequest }),
  idempotent('POST /footfall/ticks'),
  recordTickHandler,
);

/**
 * IC-only. `count.adjust` rather than `footfall.create`: keying in a clicker
 * total is a correction, not a capture, and a rank-and-file volunteer must not
 * be able to add 240 room entries in one request.
 */
footfallRouter.post(
  '/bulk',
  defaultRateLimit,
  authorize('Count.Adjust', stationFromBody),
  validate({ body: CreateFootfallBulkRequest }),
  idempotent('POST /footfall/bulk'),
  recordBulkHandler,
);

footfallRouter.post(
  '/ticks/:id/void',
  defaultRateLimit,
  authorize('Record.Void', fromParam('FootfallTick')),
  validate({ params: IdParams, body: VoidFootfallTickRequest }),
  voidTickHandler,
);

footfallRouter.get(
  '/summary',
  defaultRateLimit,
  authorizeAll('Dashboard.ReadStation', anyStation('Dashboard.ReadStation'), { any: true }),
  validate({ query: FootfallSummaryQuery }),
  summariseFootfallHandler,
);

footfallRouter.get(
  '/live',
  defaultRateLimit,
  authorizeAll('Dashboard.ReadStation', anyStation('Dashboard.ReadStation'), { any: true }),
  validate({ query: RehearsalInclusionQuery }),
  liveFootfallHandler,
);
