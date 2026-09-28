import type { Request, Response } from 'express';
import type { PushSubscriptionRequest } from '@spoh/shared';
import { getAuth } from '../../../platform/identity/index.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { subscribeDevice, unsubscribeDevice } from '../application/subscriptions.js';
import { pushEnabled, pushPublicKey } from '../application/webPush.js';

export function pushConfigHandler(_req: Request, res: Response): void {
  res.status(200).json({ enabled: pushEnabled(), publicKey: pushPublicKey() });
}

export async function subscribeHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<PushSubscriptionRequest>(req);
  const { id } = await subscribeDevice({
    volunteerId: getAuth(req).volunteerId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
  });
  res.status(201).json({ id, enabled: pushEnabled() });
}

export async function unsubscribeHandler(req: Request, res: Response): Promise<void> {
  const { endpoint } = validatedBody<{ endpoint: string }>(req);
  await unsubscribeDevice(getAuth(req).volunteerId, endpoint);

  // 204 whether or not a row existed. An unsubscribe that reports "not found"
  // tells the caller about other people's subscriptions.
  res.status(204).end();
}
