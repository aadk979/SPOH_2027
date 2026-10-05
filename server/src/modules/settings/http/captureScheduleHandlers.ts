import { z } from 'zod';
import type { Request, Response } from 'express';
import { CaptureScheduleResponse, Id, type CreateCaptureScheduleRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { createCaptureSchedule } from '../application/createCaptureSchedule.js';
import { readCaptureSchedule } from '../application/readCaptureSchedule.js';

export const captureScheduleReplay: RedactedReplay = {
  store(body) {
    return { scheduledActionId: CaptureScheduleResponse.parse(body).schedule.id };
  },
  replay(req, stored) {
    const { scheduledActionId } = z.object({ scheduledActionId: Id }).strict().parse(stored);
    return readCaptureSchedule(
      { id: scheduledActionId, request: validatedBody<CreateCaptureScheduleRequest>(req) },
      actorContextFrom(req),
    );
  },
};
export async function createCaptureScheduleHandler(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(
      await createCaptureSchedule(
        validatedBody<CreateCaptureScheduleRequest>(req),
        actorContextFrom(req),
      ),
    );
}
export async function getCaptureScheduleHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await readCaptureSchedule(validatedParams<{ id: string }>(req), actorContextFrom(req)));
}
