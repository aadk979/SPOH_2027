import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Id } from '@spoh/shared';
import { requireAuth } from '../../middleware/auth/index.js';
import { defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import { validate, validatedParams } from '../../middleware/validate.js';
import { getDataHealth, getLiveDashboard, getStationDashboard } from './service.js';

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
  requireCapability('dashboard.event.read'),
  async (_req: Request, res: Response) => {
    res.status(200).json(await getLiveDashboard());
  },
);

dashboardRouter.get(
  '/data-health',
  defaultRateLimit,
  requireCapability('dashboard.event.read'),
  async (_req: Request, res: Response) => {
    res.status(200).json(await getDataHealth());
  },
);

dashboardRouter.get(
  '/station/:id',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ params: StationIdParams }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof StationIdParams>>(req);
    res.status(200).json(await getStationDashboard(id));
  },
);
