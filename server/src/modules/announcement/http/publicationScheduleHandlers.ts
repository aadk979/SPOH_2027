import type { Request, Response } from 'express';
import type { ScheduleAnnouncementDraftRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { createPublicationSchedule } from '../application/createPublicationSchedule.js';
import { readPublicationSchedule } from '../application/readPublicationSchedule.js';

export async function createPublicationScheduleHandler(req: Request, res: Response) {
  const { id } = validatedParams<{ id: string }>(req);
  const schedule = await createPublicationSchedule(
    { id, request: validatedBody<ScheduleAnnouncementDraftRequest>(req) },
    actorContextFrom(req),
  );
  res.status(201).json({ schedule });
}
export async function readPublicationScheduleHandler(req: Request, res: Response) {
  const params = validatedParams<{ id: string; scheduleId: string }>(req);
  res.status(200).json({ schedule: await readPublicationSchedule(params, actorContextFrom(req)) });
}
