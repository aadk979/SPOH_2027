import type { Request, Response } from 'express';
import type {
  CancelScheduleRequest,
  CreateLifecycleScheduleRequest,
  CreateReportScheduleRequest,
  ScheduleParams,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { cancelSchedule } from '../application/cancelSchedule.js';
import { createLifecycleSchedule, createReportSchedule } from '../application/createSchedules.js';

export async function createLifecycleScheduleHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await createLifecycleSchedule(
        validatedBody<CreateLifecycleScheduleRequest>(req),
        actorContextFrom(req),
      ),
    );
}

export async function createReportScheduleHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await createReportSchedule(
        validatedBody<CreateReportScheduleRequest>(req),
        actorContextFrom(req),
      ),
    );
}

export async function cancelScheduleHandler(req: Request, res: Response) {
  res.status(200).json(
    await cancelSchedule(
      {
        id: validatedParams<ScheduleParams>(req).id,
        request: validatedBody<CancelScheduleRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
