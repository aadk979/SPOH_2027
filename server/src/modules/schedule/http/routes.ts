import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import {
  CancelScheduleRequest,
  CreateLifecycleScheduleRequest,
  CreateReportScheduleRequest,
  ScheduleParams,
  ScheduleTimelineQuery,
} from '@spoh/shared';
import { z } from 'zod';
import { idempotent } from '../../../platform/http/idempotency.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate, validatedQuery } from '../../../platform/http/validate.js';
import { readTimeline } from '../application/readTimeline.js';
import {
  cancelScheduleHandler,
  createLifecycleScheduleHandler,
  createReportScheduleHandler,
} from './handlers.js';

export const scheduleRouter: Router = Router();
scheduleRouter.use(requireAuth);
scheduleRouter.get(
  '/',
  defaultRateLimit,
  authorize('Settings.Read', theEvent, { changes: ['C14'] }),
  validate({ query: ScheduleTimelineQuery }),
  async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res
      .status(200)
      .json(await readTimeline(validatedQuery<ScheduleTimelineQuery>(req), actorContextFrom(req)));
  },
);

// Producers for the kinds without an owning editor (P10.8); each rechecks its action inside.
scheduleRouter.post(
  '/lifecycle',
  adminRateLimit,
  authorize('Schedule.Manage', theEvent),
  validate({ body: CreateLifecycleScheduleRequest, query: z.object({}).strict() }),
  idempotent('schedule.lifecycle.create'),
  createLifecycleScheduleHandler,
);
scheduleRouter.post(
  '/reports',
  adminRateLimit,
  authorize('Schedule.Manage', theEvent),
  validate({ body: CreateReportScheduleRequest, query: z.object({}).strict() }),
  idempotent('schedule.report.create'),
  createReportScheduleHandler,
);
scheduleRouter.post(
  '/:id/cancel',
  adminRateLimit,
  authorize('Schedule.Manage', theEvent),
  validate({ params: ScheduleParams, body: CancelScheduleRequest, query: z.object({}).strict() }),
  idempotent('schedule.cancel'),
  cancelScheduleHandler,
);
