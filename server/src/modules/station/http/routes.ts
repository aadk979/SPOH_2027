import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../../platform/identity/index.js';
import { getActiveStations } from '../application/stationGuards.js';

/**
 * Station reference data. Every authenticated caller may read it — it is the
 * map legend, not operational data, and the capture screens are unusable
 * without it.
 */
export const stationRouter: Router = Router();

stationRouter.use(requireAuth);

stationRouter.get('/', async (_req: Request, res: Response) => {
  const stations = await getActiveStations();
  res.status(200).json({ data: stations, meta: { count: stations.length, nextCursor: null } });
});
