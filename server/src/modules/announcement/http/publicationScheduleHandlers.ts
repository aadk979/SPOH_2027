import type { Request, Response } from 'express';
import type {
  ScheduleAnnouncementDraftRequest,
  UpdateAnnouncementPublicationScheduleRequest,
  CancelAnnouncementPublicationScheduleRequest,
  PaginationQuery,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { createPublicationSchedule } from '../application/createPublicationSchedule.js';
import { readPublicationSchedule } from '../application/readPublicationSchedule.js';
import { listPublicationSchedules } from '../application/listPublicationSchedules.js';
import { updatePublicationSchedule } from '../application/updatePublicationSchedule.js';
import { cancelPublicationSchedule } from '../application/cancelPublicationSchedule.js';

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

export async function listPublicationSchedulesHandler(req: Request, res: Response) {
  const { id } = validatedParams<{ id: string }>(req);
  res
    .status(200)
    .json(
      await listPublicationSchedules(
        { id, query: validatedQuery<PaginationQuery>(req) },
        actorContextFrom(req),
      ),
    );
}
export async function updatePublicationScheduleHandler(req: Request, res: Response) {
  const params = validatedParams<{ id: string; scheduleId: string }>(req);
  const schedule = await updatePublicationSchedule(
    { ...params, request: validatedBody<UpdateAnnouncementPublicationScheduleRequest>(req) },
    actorContextFrom(req),
  );
  res.status(200).json({ schedule });
}
export async function cancelPublicationScheduleHandler(req: Request, res: Response) {
  const params = validatedParams<{ id: string; scheduleId: string }>(req);
  const schedule = await cancelPublicationSchedule(
    { ...params, request: validatedBody<CancelAnnouncementPublicationScheduleRequest>(req) },
    actorContextFrom(req),
  );
  res.status(200).json({ schedule });
}
