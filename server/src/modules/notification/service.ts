import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import {
  type AnnouncementPriority,
  type CommitteeRole,
  type NotificationAudience,
  type NotificationKind,
  type NotificationResult,
  ROLE_PRECEDENCE,
} from '@spoh/shared';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { eventDayAnchor, singaporeDateString } from '../../lib/time.js';

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

/**
 * How long a push service may hold a message for a device that is offline.
 *
 * Short by design. A lost-person alert delivered forty minutes late is worse
 * than one not delivered at all: the search has moved on, the child has been
 * found, and the volunteer acts on something that is no longer true.
 */
const TTL_SECONDS: Record<NotificationKind, number> = {
  'lostPerson.raised': 600,
  'lostPerson.resolved': 600,
  'incident.critical': 900,
  'announcement.urgent': 1800,
  'gift.lowStock': 1800,
};

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

  const roleFilter: { role?: { in: CommitteeRole[] } } = {};
  if (audience.minimumRole) {
    const ceiling = ROLE_PRECEDENCE[audience.minimumRole];
    const roles = (Object.keys(ROLE_PRECEDENCE) as CommitteeRole[]).filter(
      (role) => ROLE_PRECEDENCE[role] <= ceiling,
    );
    roleFilter.role = { in: roles };
  }

  if (audience.everyone || audience.minimumRole) {
    const rows = await prisma.volunteer.findMany({
      where: { active: true, ...roleFilter },
      select: { id: true },
    });
    for (const row of rows) ids.add(row.id);
  }

  if (audience.stationId) {
    const rows = await prisma.shiftAssignment.findMany({
      where: {
        stationId: audience.stationId,
        eventDay: { date: eventDayAnchor(singaporeDateString(now)) },
        volunteer: { active: true },
      },
      select: { volunteerId: true },
    });
    for (const row of rows) ids.add(row.volunteerId);
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
    enabled: configured,
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

    if (!configured || recipients.length === 0) return base;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { volunteerId: { in: recipients } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    base.devices = subscriptions.length;
    if (subscriptions.length === 0) return base;

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
        const target: WebPushSubscription = {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        };

        try {
          await webpush.sendNotification(target, payload, {
            TTL: TTL_SECONDS[input.kind],
            urgency: input.priority === 'URGENT' ? 'high' : 'normal',
          });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;

          // 404 and 410 are the documented way a push service says the
          // subscription is permanently gone. Anything else may be transient.
          if (status === 404 || status === 410) {
            gone.push(subscription.id);
          }

          throw error;
        }
      }),
    );

    base.delivered = outcomes.filter((o) => o.status === 'fulfilled').length;
    base.failed = outcomes.length - base.delivered;

    if (gone.length > 0) {
      const { count } = await prisma.pushSubscription.deleteMany({
        where: { id: { in: gone } },
      });
      base.pruned = count;
    }

    if (base.failed > 0) {
      logger.warn(
        { kind: input.kind, failed: base.failed, pruned: base.pruned },
        'some push deliveries failed; the client polls remain the delivery guarantee',
      );
    }

    return base;
  } catch (error) {
    logger.error({ err: error, kind: input.kind }, 'notification dispatch failed');
    return base;
  }
}

/**
 * Register a device.
 *
 * Keyed on the endpoint, because that is what the push service treats as
 * unique. Re-subscribing on the same device produces the same endpoint, so this
 * is an upsert — and it reassigns ownership, which is what should happen when a
 * shared booth tablet is handed to the next volunteer.
 */
export async function subscribeDevice(input: {
  volunteerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}): Promise<{ id: string }> {
  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      volunteerId: input.volunteerId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
    },
    update: {
      volunteerId: input.volunteerId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      lastSeenAt: new Date(),
      failureCount: 0,
    },
    select: { id: true },
  });

  return row;
}

/** Scoped to the caller's own subscriptions: you may only unsubscribe yourself. */
export async function unsubscribeDevice(volunteerId: string, endpoint: string): Promise<boolean> {
  const { count } = await prisma.pushSubscription.deleteMany({
    where: { endpoint, volunteerId },
  });
  return count > 0;
}
