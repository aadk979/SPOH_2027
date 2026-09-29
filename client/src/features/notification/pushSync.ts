import type { PushSubscriptionRequest } from '@spoh/shared';
import { registerPush } from './api';

/**
 * Keeping the server's copy of this phone's push subscription current (F03-035).
 *
 * The browser may replace a subscription at any time, and a different volunteer
 * may sign in on the same phone. Either way the server holds an endpoint that
 * no longer reaches the person signed in. So the app registers the browser's
 * current subscription whenever it differs from the one it last registered for
 * this volunteer: on each sign-in or load, and when the worker says it changed.
 * The server upserts by endpoint and takes the new owner.
 */

const REGISTERED_KEY = 'spoh.push.registered';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function toPushRequest(subscription: PushSubscription): PushSubscriptionRequest {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('the browser returned an incomplete subscription');
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Storage can be unavailable (private mode); then every sync registers again. */
function lastRegistered(): string | null {
  try {
    return localStorage.getItem(REGISTERED_KEY);
  } catch {
    return null;
  }
}

export function rememberRegistered(volunteerId: string | null, endpoint: string | null): void {
  try {
    if (volunteerId && endpoint) localStorage.setItem(REGISTERED_KEY, `${volunteerId} ${endpoint}`);
    else localStorage.removeItem(REGISTERED_KEY);
  } catch {
    // Nothing to keep; the next sync registers again, which the server tolerates.
  }
}

export async function syncPushSubscription(volunteerId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription || lastRegistered() === `${volunteerId} ${subscription.endpoint}`) return;
  try {
    await registerPush(toPushRequest(subscription));
    rememberRegistered(volunteerId, subscription.endpoint);
  } catch {
    // Best effort, like all push: the alert poll still delivers. Retried next sync.
  }
}
