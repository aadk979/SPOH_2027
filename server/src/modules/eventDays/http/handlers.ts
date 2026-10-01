import type { Request, Response } from 'express';
import type {
  CreateEventDayRequest,
  UpdateEventDayRequest,
  UpdateShiftTemplateRequest,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { createEventDay } from '../application/createEventDay.js';
import { listEventDays } from '../application/listEventDays.js';
import { listShiftTemplates } from '../application/listShiftTemplates.js';
import { updateEventDay } from '../application/updateEventDay.js';
import { updateShiftTemplate } from '../application/updateShiftTemplate.js';

export async function listEventDaysHandler(req: Request, res: Response): Promise<void> {
  const days = await listEventDays(scopeOf(req));
  res.status(200).json({ data: days, meta: { count: days.length, nextCursor: null } });
}

export async function createEventDayHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateEventDayRequest>(req);
  res.status(201).json({ eventDay: await createEventDay(body, actorContextFrom(req)) });
}

export async function updateEventDayHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const patch = validatedBody<UpdateEventDayRequest>(req);
  res.status(200).json({ eventDay: await updateEventDay(id, patch, actorContextFrom(req)) });
}

export async function listShiftTemplatesHandler(req: Request, res: Response): Promise<void> {
  const templates = await listShiftTemplates(scopeOf(req));
  res.status(200).json({ data: templates, meta: { count: templates.length, nextCursor: null } });
}

export async function updateShiftTemplateHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const patch = validatedBody<UpdateShiftTemplateRequest>(req);
  res.status(200).json({ template: await updateShiftTemplate(id, patch, actorContextFrom(req)) });
}
