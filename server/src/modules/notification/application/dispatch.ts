import type {
  AnnouncementPriority,
  NotificationAudience,
  NotificationKind,
  NotificationResult,
} from '@spoh/shared';
import { logger } from '../../../platform/logger/index.js';
import { eventDayAnchor, singaporeDateString } from '../../../platform/time/index.js';
import {
  deleteSubscriptions,
  findActiveVolunteerIds,
  findRosteredAt,
  findSubscriptions,
} from '../data/repo.js';
import { rolesAtOrAbove, subscriptionGone, TTL_SECONDS } from '../domain/delivery.js';
import { pushEnabled, sendPush } from './webPush.js';

export interface NotificationInput {
  kind: NotificationKind;
  priority: AnnouncementPriority;
  title: string;
  body: string;
  /** Where tapping the notification should land. */
  url: string;
  /**
   * Collapse key. A second alert about the same incident replaces the first on
   * the lock screen rather than stacking — six notifications about one event is
   * how people learn to swipe them all away.
   */
  tag: string;
  audience: NotificationAudience;
  /** Volunteer to leave out — normally whoever raised the thing. */
  excludeVolunteerId?: string;
}

/**
 * Resolve an audience to volunteer ids.
 *
 * Station targeting means "rostered there today", not "has ever worked there".
 * An usher who covered DCDF yesterday should not be woken about it now.
 */
async function resolveAudience(audience: NotificationAudience, now: Date): Promise<string[]> {
  const ids = new Set<string>(audience.volunteerIds);

  if (audience.everyone || audience.minimumRole) {
    const roles = audience.minimumRole ? rolesAtOrAbove(audience.minimumRole) : undefined;
    for (const id of await findActiveVolunteerIds(roles)) ids.add(id);
  }

  if (audience.stationId) {
    const today = eventDayAnchor(singaporeDateString(now));
    for (const id of await findRosteredAt(audience.stationId, today)) ids.add(id);
  }

  return [...ids];
}

/**
 * Send. Never throws.
 *
 * A failed notification must not fail the incident report that triggered it —
 * the record is the point, the alert is the courtesy. Every failure path here
 * ends in a log line and a count.
 */
export async function dispatch(
  input: NotificationInput,
  now: Date = new Date(),
): Promise<NotificationResult> {
  const base: NotificationResult = {
    kind: input.kind,
    priority: input.priority,
    recipients: 0,
    devices: 0,
    delivered: 0,
    failed: 0,
    pruned: 0,
    enabled: pushEnabled(),
  };

  try {
    const recipients = (await resolveAudience(input.audience, now)).filter(
      (id) => id !== input.excludeVolunteerId,
    );
    base.recipients = recipients.length;

    // The log line is not a fallback for the unconfigured case alone — it is the
    // operational record that the system tried to reach somebody, and it stays
    // useful when push is working.
    logger.warn({ kind: input.kind, recipients: recipients.length, tag: input.tag }, input.title);

    if (!pushEnabled() || recipients.length === 0) return base;

    const subscriptions = await findSubscriptions(recipients);
    base.devices = subscriptions.length;
    if (subscriptions.length === 0) return base;

    await sendToDevices(input, subscriptions, base);
    return base;
  } catch (error) {
    logger.error({ err: error, kind: input.kind }, 'notification dispatch failed');
    return base;
  }
}

/** Send to every device at once, prune the ones the push service says are gone. */
async function sendToDevices(
  input: NotificationInput,
  subscriptions: Awaited<ReturnType<typeof findSubscriptions>>,
  result: NotificationResult,
): Promise<void> {
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.tag,
    kind: input.kind,
    priority: input.priority,
  });

  const gone: string[] = [];

  const outcomes = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await sendPush(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { ttlSeconds: TTL_SECONDS[input.kind], urgent: input.priority === 'URGENT' },
        );
      } catch (error) {
        if (subscriptionGone((error as { statusCode?: number }).statusCode)) {
          gone.push(subscription.id);
        }
        throw error;
      }
    }),
  );

  result.delivered = outcomes.filter((o) => o.status === 'fulfilled').length;
  result.failed = outcomes.length - result.delivered;

  if (gone.length > 0) result.pruned = await deleteSubscriptions(gone);

  if (result.failed > 0) {
    logger.warn(
      { kind: input.kind, failed: result.failed, pruned: result.pruned },
      'some push deliveries failed; the client polls remain the delivery guarantee',
    );
  }
}
