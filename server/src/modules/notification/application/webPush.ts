import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { env } from '../../../config/env.js';
import { logger } from '../../../platform/logger/index.js';
import { SEND_TIMEOUT_MS } from '../domain/delivery.js';

/**
 * Web Push delivery (RFC 8030 / 8292).
 *
 * ── What this is not ────────────────────────────────────────────────────────
 *
 * It is not the delivery guarantee. The ten-second lost-person poll and the
 * three-second dashboard poll remain the contract, and they keep working when a
 * push service is unreachable, a browser has revoked the permission, or the
 * volunteer is on an iOS version that never supported it. Push covers the one
 * case polling cannot: a phone in a pocket with the app closed.
 *
 * That ordering matters. If push were load-bearing, every one of those failure
 * modes would become a silent non-delivery of exactly the alerts that matter
 * most — and nobody would find out until a child was missing.
 *
 * ── Staying quiet ───────────────────────────────────────────────────────────
 *
 * Only five categories are eligible, and every one of them is something a
 * volunteer must act on within minutes. Volunteers who get forty pushes stop
 * reading pushes by 11am, and then the one that matters is the one they miss.
 *
 * ── Unconfigured is a supported state ───────────────────────────────────────
 *
 * With no VAPID keys this degrades to the structured log line it replaced, and
 * reports `enabled: false`. A deployment without push is quieter, not broken.
 */

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

if (configured) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT as string,
    env.VAPID_PUBLIC_KEY as string,
    env.VAPID_PRIVATE_KEY as string,
  );
  logger.info('web push configured');
} else {
  logger.warn(
    'web push is not configured (VAPID keys unset): urgent alerts will rely on the client polls alone',
  );
}

export function pushEnabled(): boolean {
  return configured;
}

export function pushPublicKey(): string | null {
  return configured ? (env.VAPID_PUBLIC_KEY as string) : null;
}

export type { WebPushSubscription };

/** Send one encrypted message to one device; throws with the push service's status. */
export async function sendPush(
  target: WebPushSubscription,
  payload: string,
  options: { ttlSeconds: number; urgent: boolean },
): Promise<void> {
  await webpush.sendNotification(target, payload, {
    TTL: options.ttlSeconds,
    urgency: options.urgent ? 'high' : 'normal',
    // A push service that hangs must not hold a lost-person alert's fan-out open (F04-025).
    timeout: SEND_TIMEOUT_MS,
  });
}
