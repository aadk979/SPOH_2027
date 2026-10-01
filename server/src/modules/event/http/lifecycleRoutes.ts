import { Router } from 'express';
import { TransitionEventRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { requireCapability } from '../../../platform/http/access.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { readLifecycleHandler, transitionEventHandler } from './lifecycleHandlers.js';

export const eventLifecycleRouter: Router = Router();
eventLifecycleRouter.use(requireAuth);
eventLifecycleRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('config.manage'),
  readLifecycleHandler,
);
eventLifecycleRouter.post(
  '/',
  sensitiveRateLimit,
  requireCapability('config.manage'),
  validate({ body: TransitionEventRequest }),
  idempotent('POST /lifecycle'),
  transitionEventHandler,
);
