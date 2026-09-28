import type { Request, Response } from 'express';
import { validatedParams } from '../../../platform/http/validate.js';
import { getDataHealth } from '../application/getDataHealth.js';
import { getLiveDashboard } from '../application/getLiveDashboard.js';
import { getStationDashboard } from '../application/getStationDashboard.js';

export async function liveDashboardHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await getLiveDashboard());
}

export async function dataHealthHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await getDataHealth());
}

export async function stationDashboardHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json(await getStationDashboard(id));
}
