import type { Request, Response } from 'express';
import type { PushSubscriptionRequest } from '@spoh/shared';
import { getPerson } from '../../../platform/http/requireAuth.js';
import { validatedBody } from '../../../platform/http/validate.js';
import type { Clock } from '../../../platform/time/index.js';
import { subscribeDevice, unsubscribeDevice } from '../application/subscriptions.js';
import { pushEnabled } from '../application/webPush.js';

export function personDeviceHandlers(clock?: Clock) {
  return {
    subscribe: async (req: Request, res: Response) => {
      const body = validatedBody<PushSubscriptionRequest>(req);
      const { id } = await subscribeDevice({ volunteerId: getPerson(req).personId, endpoint: body.endpoint,
        p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: req.get('user-agent')?.slice(0, 512) ?? null }, clock);
      res.status(201).json({ id, enabled: pushEnabled() });
    },
    unsubscribe: async (req: Request, res: Response) => {
      await unsubscribeDevice(getPerson(req).personId, validatedBody<{ endpoint: string }>(req).endpoint);
      res.status(204).end();
    },
  };
}
