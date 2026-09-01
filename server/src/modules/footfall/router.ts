import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CreateFootfallBulkRequest,
  CreateFootfallTickRequest,
  FootfallSummaryQuery,
  Id,
  VoidFootfallTickRequest,
} from '@spoh/shared';
import { requireAuth } from '../../middleware/auth/index.js';
import { idempotent } from '../../middleware/idempotency.js';
import { captureRateLimit, defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability, requireStationScope } from '../../middleware/rbac.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { captureActorFrom } from '../../lib/captureActor.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import {
  getLiveFootfall,
  recordBulk,
  recordTick,
  summariseFootfall,
  voidTickById,
} from './service.js';

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
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateFootfallTickRequest>(req);
    const result = await recordTick(body, captureActorFrom(req), auditContextFrom(req));
    res.status(201).json(result);
  },
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
  async (req: Request, res: Response) => {
    const body = validatedBody<CreateFootfallBulkRequest>(req);
    const result = await recordBulk(body, captureActorFrom(req), auditContextFrom(req));
    res.status(201).json(result);
  },
);

footfallRouter.post(
  '/ticks/:id/void',
  defaultRateLimit,
  requireCapability('record.void'),
  validate({ params: IdParams, body: VoidFootfallTickRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const { reason } = validatedBody<VoidFootfallTickRequest>(req);
    await voidTickById(id, reason, auditContextFrom(req));
    res.status(204).send();
  },
);

footfallRouter.get(
  '/summary',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: FootfallSummaryQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<FootfallSummaryQuery>(req);
    res.status(200).json(await summariseFootfall(query));
  },
);

footfallRouter.get(
  '/live',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  async (_req: Request, res: Response) => {
    res.status(200).json(await getLiveFootfall());
  },
);
