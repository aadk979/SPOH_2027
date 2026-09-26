import { Router } from 'express';
import { z } from 'zod';
import {
  CreateFootfallBulkRequest,
  CreateFootfallTickRequest,
  FootfallSummaryQuery,
  Id,
  VoidFootfallTickRequest,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/identity/index.js';
import { idempotent } from '../../../platform/idempotency/index.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability, requireStationScope } from '../../../platform/access/index.js';
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
  requireCapability('footfall.create'),
  validate({ body: CreateFootfallTickRequest }),
  requireStationScope(),
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
  requireCapability('count.adjust'),
  validate({ body: CreateFootfallBulkRequest }),
  requireStationScope(),
  idempotent('POST /footfall/bulk'),
  recordBulkHandler,
);

footfallRouter.post(
  '/ticks/:id/void',
  defaultRateLimit,
  requireCapability('record.void'),
  validate({ params: IdParams, body: VoidFootfallTickRequest }),
  voidTickHandler,
);

footfallRouter.get(
  '/summary',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: FootfallSummaryQuery }),
  summariseFootfallHandler,
);

footfallRouter.get(
  '/live',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  liveFootfallHandler,
);
