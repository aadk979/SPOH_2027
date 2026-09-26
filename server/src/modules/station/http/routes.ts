import { Router } from 'express';
import { requireAuth } from '../../../platform/identity/index.js';
import { listStationsHandler } from './handlers.js';

/**
 * Station reference data. Every authenticated caller may read it — it is the
 * map legend, not operational data, and the capture screens are unusable
 * without it.
 */
export const stationRouter: Router = Router();

stationRouter.use(requireAuth);

stationRouter.get('/', listStationsHandler);
