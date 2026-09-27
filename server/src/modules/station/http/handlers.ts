import type { Request, Response } from 'express';
import type { CreateStationRequest, UpdateStationRequest } from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { createStation } from '../application/createStation.js';
import { listActiveStations } from '../application/listActiveStations.js';
import { listAllStations } from '../application/listAllStations.js';
import { updateStation } from '../application/updateStation.js';

export async function listStationsHandler(_req: Request, res: Response): Promise<void> {
  const stations = await listActiveStations();
  res.status(200).json({ data: stations, meta: { count: stations.length, nextCursor: null } });
}

/**
 * Includes inactive stations, unlike `GET /stations`: the public list is the
 * map legend and must not offer a closed room as a capture target; this one is
 * the configuration screen, where a closed room is what you came to reopen.
 */
export async function listAllStationsHandler(_req: Request, res: Response): Promise<void> {
  const stations = await listAllStations();
  res.status(200).json({ data: stations, meta: { count: stations.length, nextCursor: null } });
}

export async function createStationHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateStationRequest>(req);
  res.status(201).json({ station: await createStation(body, auditContextFrom(req)) });
}

export async function updateStationHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const patch = validatedBody<UpdateStationRequest>(req);
  res.status(200).json({ station: await updateStation(id, patch, auditContextFrom(req)) });
}
