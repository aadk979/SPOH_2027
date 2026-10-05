import { z } from 'zod';
import type { Request, Response } from 'express';
import {
  CaptureScheduleResponse,
  Id,
  type CaptureScheduleListQuery,
  type CancelCaptureScheduleRequest,
  type UpdateCaptureScheduleRequest,
} from '@spoh/shared';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { listCaptureSchedules } from '../application/listCaptureSchedules.js';
import { cancelCaptureSchedule } from '../application/cancelCaptureSchedule.js';
import { updateCaptureSchedule } from '../application/updateCaptureSchedule.js';
import { readCaptureScheduleMutation } from '../application/readCaptureScheduleMutation.js';

const Receipt = z
  .object({ scheduledActionId: Id, mutationVersion: z.number().int().positive() })
  .strict();
function storeMutation(body: unknown) {
  const { schedule } = CaptureScheduleResponse.parse(body);
  return { scheduledActionId: schedule.id, mutationVersion: schedule.version };
}
function readReceipt(req: Request, stored: unknown) {
  const receipt = Receipt.parse(stored);
  if (validatedParams<{ id: string }>(req).id !== receipt.scheduledActionId)
    throw new IdempotencyKeyReuseError();
  return { id: receipt.scheduledActionId, mutationVersion: receipt.mutationVersion };
}
export const captureScheduleEditReplay: RedactedReplay = {
  store: storeMutation,
  replay: (req, stored) =>
    readCaptureScheduleMutation(
      {
        ...readReceipt(req, stored),
        action: 'schedule.update',
        request: validatedBody<UpdateCaptureScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
};
export const captureScheduleCancelReplay: RedactedReplay = {
  store: storeMutation,
  replay: (req, stored) =>
    readCaptureScheduleMutation(
      {
        ...readReceipt(req, stored),
        action: 'schedule.cancel',
        request: validatedBody<CancelCaptureScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
};
export async function listCaptureSchedulesHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await listCaptureSchedules(
        validatedQuery<CaptureScheduleListQuery>(req),
        actorContextFrom(req),
      ),
    );
}
export async function updateCaptureScheduleHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(
    await updateCaptureSchedule(
      {
        ...validatedParams<{ id: string }>(req),
        request: validatedBody<UpdateCaptureScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function cancelCaptureScheduleHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(
    await cancelCaptureSchedule(
      {
        ...validatedParams<{ id: string }>(req),
        request: validatedBody<CancelCaptureScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
