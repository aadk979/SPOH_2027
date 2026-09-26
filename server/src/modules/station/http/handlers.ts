import type { Request, Response } from 'express';
import { listActiveStations } from '../application/listActiveStations.js';

export async function listStationsHandler(_req: Request, res: Response): Promise<void> {
  const stations = await listActiveStations();
  res.status(200).json({ data: stations, meta: { count: stations.length, nextCursor: null } });
}
