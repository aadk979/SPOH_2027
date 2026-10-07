import type { Request, Response } from 'express';
import type { RenameEventRequest, RenameEventResponse } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { getPerson } from '../../../platform/http/requireAuth.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { listMyEvents } from '../application/listMyEvents.js';
import { renameEvent } from '../application/renameEvent.js';

export async function listMyEventsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await listMyEvents(getPerson(req).personId) });
}

export async function renameEventHandler(req: Request, res: Response): Promise<void> {
  const change = validatedBody<RenameEventRequest>(req);
  const body: RenameEventResponse = { event: await renameEvent(change, actorContextFrom(req)) };
  res.status(200).json(body);
}
