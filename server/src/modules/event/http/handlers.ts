import type { Request, Response } from 'express';
import { getPerson } from '../../../platform/http/requireAuth.js';
import { listMyEvents } from '../application/listMyEvents.js';

export async function listMyEventsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await listMyEvents(getPerson(req).personId) });
}
