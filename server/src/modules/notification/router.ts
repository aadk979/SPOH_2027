import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PushSubscriptionRequest } from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { captureRateLimit, defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import { validate, validatedBody } from '../../middleware/validate.js';
import { pushEnabled, pushPublicKey, subscribeDevice, unsubscribeDevice } from './service.js';

/**
 * Push registration.
 *
 * Every signed-in volunteer may register their own device, and only their own —
 * the subscription is written against `req.auth.volunteerId`, never against an
 * id from the body.
 */
export const notificationRouter: Router = Router();

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
  requireCapability('own.read'),
  (_req: Request, res: Response) => {
    res.status(200).json({ enabled: pushEnabled(), publicKey: pushPublicKey() });
  },
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
  requireCapability('own.read'),
  validate({ body: PushSubscriptionRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<PushSubscriptionRequest>(req);

    const { id } = await subscribeDevice({
      volunteerId: auth.volunteerId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    });

    res.status(201).json({ id, enabled: pushEnabled() });
  },
);

const UnsubscribeRequest = z.object({ endpoint: z.url().max(2048) }).strict();

notificationRouter.delete(
  '/subscriptions',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ body: UnsubscribeRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { endpoint } = validatedBody<z.infer<typeof UnsubscribeRequest>>(req);

    await unsubscribeDevice(auth.volunteerId, endpoint);

    // 204 whether or not a row existed. An unsubscribe that reports "not found"
    // tells the caller about other people's subscriptions.
    res.status(204).end();
  },
);
