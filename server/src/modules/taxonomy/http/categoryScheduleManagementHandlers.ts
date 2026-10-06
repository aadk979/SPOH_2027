import { z } from 'zod';
import type { Request, Response } from 'express';
import {
  CategoryScheduleResponse,
  Id,
  type CategoryActivityParams,
  type CategoryScheduleParams,
  type CategoryScheduleListQuery,
  type UpdateCategoryScheduleRequest,
  type CancelCategoryScheduleRequest,
} from '@spoh/shared';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { listCategorySchedules } from '../application/listCategorySchedules.js';
import { updateCategorySchedule } from '../application/updateCategorySchedule.js';
import { cancelCategorySchedule } from '../application/cancelCategorySchedule.js';
import { readCategoryScheduleMutation } from '../application/readCategoryScheduleMutation.js';

const Receipt = z
  .object({ scheduledActionId: Id, categoryId: Id, mutationVersion: z.number().int().positive() })
  .strict();
function storeMutation(body: unknown) {
  const { schedule } = CategoryScheduleResponse.parse(body);
  return {
    scheduledActionId: schedule.id,
    categoryId: schedule.categoryId,
    mutationVersion: schedule.version,
  };
}
function readReceipt(req: Request, stored: unknown) {
  const receipt = Receipt.parse(stored);
  const params = validatedParams<CategoryScheduleParams>(req);
  if (params.id !== receipt.scheduledActionId || params.categoryId !== receipt.categoryId)
    throw new IdempotencyKeyReuseError();
  return { ...params, mutationVersion: receipt.mutationVersion };
}
export const categoryScheduleEditReplay: RedactedReplay = {
  store: storeMutation,
  replay: (req, stored) =>
    readCategoryScheduleMutation(
      {
        ...readReceipt(req, stored),
        action: 'schedule.update',
        request: validatedBody<UpdateCategoryScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
};
export const categoryScheduleCancelReplay: RedactedReplay = {
  store: storeMutation,
  replay: (req, stored) =>
    readCategoryScheduleMutation(
      {
        ...readReceipt(req, stored),
        action: 'schedule.cancel',
        request: validatedBody<CancelCategoryScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
};
export async function listCategorySchedulesHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(
    await listCategorySchedules(
      {
        ...validatedParams<CategoryActivityParams>(req),
        query: validatedQuery<CategoryScheduleListQuery>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function updateCategoryScheduleHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(
    await updateCategorySchedule(
      {
        ...validatedParams<CategoryScheduleParams>(req),
        request: validatedBody<UpdateCategoryScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function cancelCategoryScheduleHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(
    await cancelCategorySchedule(
      {
        ...validatedParams<CategoryScheduleParams>(req),
        request: validatedBody<CancelCategoryScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
