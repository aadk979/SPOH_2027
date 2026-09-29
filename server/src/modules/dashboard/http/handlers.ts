import type { Request, Response } from 'express';
import { validatedParams } from '../../../platform/http/validate.js';
import { getDataHealth } from '../application/getDataHealth.js';
import { getLiveDashboard } from '../application/getLiveDashboard.js';
import { getStationDashboard } from '../application/getStationDashboard.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';

export async function liveDashboardHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getLiveDashboard(scopeOf(req)));
}

export async function dataHealthHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getDataHealth(scopeOf(req)));
}

export async function stationDashboardHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json(await getStationDashboard(scopeOf(req), id));
}
