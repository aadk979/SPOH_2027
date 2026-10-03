import type { AnnouncementPriority, NotificationKind } from '@spoh/shared';
import { subscriptionGone } from '../domain/delivery.js';
import { pushEnabled, sendPush, type WebPushSubscription } from './webPush.js';

export interface DevicePushInput {
  target: WebPushSubscription;
  payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
    kind: NotificationKind;
    priority: AnnouncementPriority;
  };
  ttlSeconds: number;
}
export type DevicePushResult = 'ACCEPTED' | 'UNCONFIGURED' | 'GONE' | 'FAILED';

/** One bounded external attempt; callers own durability. Never logs or returns raw errors. */
export async function sendDevicePush(input: DevicePushInput): Promise<DevicePushResult> {
  if (!pushEnabled()) return 'UNCONFIGURED';
  try {
    await sendPush(input.target, JSON.stringify(input.payload), {
      ttlSeconds: input.ttlSeconds,
      urgent: input.payload.priority === 'URGENT',
    });
    return 'ACCEPTED';
  } catch (error) {
    return subscriptionGone((error as { statusCode?: number } | null)?.statusCode)
      ? 'GONE'
      : 'FAILED';
  }
}
