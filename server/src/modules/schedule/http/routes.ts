import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { ScheduleTimelineQuery } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { requireCapability } from '../../../platform/http/access.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate, validatedQuery } from '../../../platform/http/validate.js';
import { readTimeline } from '../application/readTimeline.js';

export const scheduleRouter: Router = Router();
scheduleRouter.use(requireAuth);
scheduleRouter.get(
  '/',
  defaultRateLimit,
  authorize('Schedule.Manage', theEvent),
  requireCapability('config.manage'),
  validate({ query: ScheduleTimelineQuery }),
  async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res
      .status(200)
      .json(await readTimeline(validatedQuery<ScheduleTimelineQuery>(req), actorContextFrom(req)));
  },
);
