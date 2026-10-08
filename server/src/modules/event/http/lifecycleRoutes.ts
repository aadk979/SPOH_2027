import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import { theEvent, lifecycleTransition } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { TransitionEventRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { requireCapability } from '../../../platform/http/access.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  readLifecycleHandler,
  readLifecycleReadinessHandler,
  transitionEventHandler,
} from './lifecycleHandlers.js';

export const eventLifecycleRouter: Router = Router();
eventLifecycleRouter.use(requireAuth);
eventLifecycleRouter.get(
  '/',
  defaultRateLimit,
  authorize('Event.MarkReady', theEvent),
  requireCapability('config.manage'),
  readLifecycleHandler,
);
eventLifecycleRouter.get(
  '/readiness',
  defaultRateLimit,
  authorize('Event.MarkReady', theEvent),
  requireCapability('config.manage'),
  readLifecycleReadinessHandler,
);
eventLifecycleRouter.post(
  '/',
  // First, so refusals (rate limit, capability, validation, readiness
  // blockers) and replayed receipts are never cached either.
  function noStore(_req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
  sensitiveRateLimit,
  authorizeAll('Event.Transition', lifecycleTransition, { changes: ['C13'] }),
  requireCapability('config.manage'),
  validate({ body: TransitionEventRequest }),
  idempotent('POST /lifecycle'),
  transitionEventHandler,
);
