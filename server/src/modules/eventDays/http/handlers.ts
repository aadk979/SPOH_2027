import type { Request, Response } from 'express';
import type { CreateEventDayRequest, UpdateEventDayRequest } from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { createEventDay } from '../application/createEventDay.js';
import { listEventDays } from '../application/listEventDays.js';
import { updateEventDay } from '../application/updateEventDay.js';

export async function listEventDaysHandler(_req: Request, res: Response): Promise<void> {
  const days = await listEventDays();
  res.status(200).json({ data: days, meta: { count: days.length, nextCursor: null } });
}

export async function createEventDayHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateEventDayRequest>(req);
  res.status(201).json({ eventDay: await createEventDay(body, auditContextFrom(req)) });
}

export async function updateEventDayHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const patch = validatedBody<UpdateEventDayRequest>(req);
  res.status(200).json({ eventDay: await updateEventDay(id, patch, auditContextFrom(req)) });
}
