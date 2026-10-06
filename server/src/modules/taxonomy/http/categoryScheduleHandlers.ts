import { z } from 'zod';
import type { Request, Response } from 'express';
import {
  CategoryScheduleResponse,
  Id,
  type CategoryActivityParams,
  type CategoryScheduleParams,
  type CreateCategoryScheduleRequest,
} from '@spoh/shared';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { createCategorySchedule } from '../application/createCategorySchedule.js';
import { readCategorySchedule } from '../application/readCategorySchedule.js';

export const categoryScheduleCreateReplay: RedactedReplay = {
  store(body) {
    const { schedule } = CategoryScheduleResponse.parse(body);
    return { scheduledActionId: schedule.id, categoryId: schedule.categoryId };
  },
  replay(req, stored) {
    const receipt = z.object({ scheduledActionId: Id, categoryId: Id }).strict().parse(stored);
    const { categoryId } = validatedParams<CategoryActivityParams>(req);
    if (receipt.categoryId !== categoryId) throw new IdempotencyKeyReuseError();
    return readCategorySchedule(
      {
        categoryId,
        id: receipt.scheduledActionId,
        request: validatedBody<CreateCategoryScheduleRequest>(req),
      },
      actorContextFrom(req),
    );
  },
};
export async function createCategoryScheduleHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json(
    await createCategorySchedule(
      {
        ...validatedParams<CategoryActivityParams>(req),
        request: validatedBody<CreateCategoryScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function getCategoryScheduleHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await readCategorySchedule(
        validatedParams<CategoryScheduleParams>(req),
        actorContextFrom(req),
      ),
    );
}
