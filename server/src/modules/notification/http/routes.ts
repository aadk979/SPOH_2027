import { authorize } from '../../../platform/http/authorize.js';
import { self } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import { PushSubscriptionRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { pushConfigHandler, subscribeHandler, unsubscribeHandler } from './handlers.js';

/**
 * Push registration.
 *
 * Every signed-in volunteer may register their own device, and only their own —
 * the subscription is written against `req.auth.volunteerId`, never against an
 * id from the body.
 */
export const notificationRouter: Router = Router();

const UnsubscribeRequest = z.object({ endpoint: z.url().max(2048) }).strict();

notificationRouter.use(requireAuth);

/**
 * The public VAPID key, served rather than baked into the client bundle.
 *
 * It is public by definition — the browser needs it to subscribe — but serving
 * it means rotating the pair does not require a client rebuild, and it is the
 * one call that tells the client whether to offer the permission prompt at all.
 */
notificationRouter.get(
  '/config',
  defaultRateLimit,
  authorize('Self.Read', self),
  pushConfigHandler,
);

/**
 * Register or refresh this device.
 *
 * The capture rate limit rather than the default: browsers re-subscribe
 * whenever the push service rotates an endpoint, and a booth tablet that woke
 * up to a rotated subscription should not be throttled alongside its taps.
 */
notificationRouter.post(
  '/subscriptions',
  captureRateLimit,
  authorize('Self.Read', self),
  validate({ body: PushSubscriptionRequest }),
  subscribeHandler,
);

notificationRouter.delete(
  '/subscriptions',
  defaultRateLimit,
  authorize('Self.Read', self),
  validate({ body: UnsubscribeRequest }),
  unsubscribeHandler,
);
