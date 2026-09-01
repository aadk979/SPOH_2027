import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CloseFallbackRequest,
  DeclareFallbackRequest,
  Id,
  ImportFootfallRequest,
  ImportRegistrationsRequest,
  TimeRangeQuery,
} from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import {
  closeFallback,
  declareFallback,
  importFootfall,
  importRegistrations,
  listFallbackWindows,
} from './service.js';

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
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<DeclareFallbackRequest>(req);
    const window = await declareFallback(body, auth.volunteerId, auditContextFrom(req));
    res.status(201).json({ window });
  },
);

fallbackRouter.post(
  '/windows/:id/close',
  defaultRateLimit,
  requireCapability('fallback.declare'),
  validate({ params: IdParams, body: CloseFallbackRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<CloseFallbackRequest>(req);
    res.status(200).json({ window: await closeFallback(id, body, auditContextFrom(req)) });
  },
);

/** Readable by anyone who can read a dashboard — it explains the numbers. */
fallbackRouter.get(
  '/windows',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: TimeRangeQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<TimeRangeQuery>(req);
    const windows = await listFallbackWindows({
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    });
    res.status(200).json({ data: windows, meta: { count: windows.length, nextCursor: null } });
  },
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
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<ImportRegistrationsRequest>(req);
    const result = await importRegistrations(body, {
      actorId: auth.volunteerId,
      audit: auditContextFrom(req),
    });
    res.status(result.committed ? 201 : 200).json(result);
  },
);

fallbackRouter.post(
  '/imports/footfall',
  sensitiveRateLimit,
  requireCapability('fallback.import'),
  validate({ body: ImportFootfallRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<ImportFootfallRequest>(req);
    const result = await importFootfall(body, {
      actorId: auth.volunteerId,
      audit: auditContextFrom(req),
    });
    res.status(result.committed ? 201 : 200).json(result);
  },
);
