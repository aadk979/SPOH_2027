import { z } from 'zod';
import { AnnouncementPriority, CommitteeRole } from '../enums.js';
import { Id } from './common.js';

/**
 * Web Push (RFC 8030).
 *
 * Push is best effort and always has been: the ten-second alert poll and the
 * three-second dashboard poll are the contract, and they keep working when a
 * push service is unreachable, a browser has revoked the permission, or the
 * phone is a model that never supported it. What push adds is the case the
 * polls cannot cover — a phone in a pocket with the app closed.
 *
 * The system stays deliberately quiet. Only genuinely urgent categories are
 * eligible: a lost-person alert, a critical incident, an URGENT announcement,
 * and gift stock running out. Volunteers who get forty pushes stop reading
 * pushes by 11am, and then the one that matters is the one they miss.
 */

/** What the browser's PushManager hands back, transcribed to our shape. */
export const PushSubscriptionRequest = z
  .object({
    endpoint: z.url().max(2048),
    keys: z
      .object({
        p256dh: z.string().min(1).max(255),
        auth: z.string().min(1).max(255),
      })
      .strict(),
  })
  .strict();
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequest>;

export const PushSubscriptionResponse = z
  .object({
    id: Id,
    /** False when the server has no VAPID keys configured; the client stays quiet. */
    enabled: z.boolean(),
  })
  .strict();
export type PushSubscriptionResponse = z.infer<typeof PushSubscriptionResponse>;

/**
 * The public half of the VAPID pair, needed by the browser to subscribe.
 * Public by definition — it ships in the client bundle either way — but served
 * rather than baked in so rotating the pair does not need a client rebuild.
 */
export const PushConfigResponse = z
  .object({
    enabled: z.boolean(),
    publicKey: z.string().nullable(),
  })
  .strict();
export type PushConfigResponse = z.infer<typeof PushConfigResponse>;

/** Categories a volunteer can be reached about. Used for delivery accounting. */
export const NotificationKind = z.enum([
  'lostPerson.raised',
  'lostPerson.resolved',
  'incident.critical',
  'announcement.urgent',
  'gift.lowStock',
]);
export type NotificationKind = z.infer<typeof NotificationKind>;

/**
 * Who a notification goes to. Resolved server-side against today's roster —
 * "everyone at DCDF Station" means everyone rostered there today, not everyone
 * who has ever worked there.
 */
export const NotificationAudience = z
  .object({
    /** Every active volunteer. Used only for a lost-person alert. */
    everyone: z.boolean().default(false),
    /** At least this senior. */
    minimumRole: CommitteeRole.optional(),
    /** Rostered at this station today. */
    stationId: Id.optional(),
    /** Named individuals, on top of whatever the filters match. */
    volunteerIds: z.array(Id).max(200).default([]),
  })
  .strict();
export type NotificationAudience = z.infer<typeof NotificationAudience>;

/** What a delivery attempt achieved, for the audit trail and the admin screen. */
export const NotificationResult = z
  .object({
    kind: NotificationKind,
    priority: AnnouncementPriority,
    recipients: z.number().int().nonnegative(),
    devices: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    /** Subscriptions the push service reported as gone, and we removed. */
    pruned: z.number().int().nonnegative(),
    /** False when push is not configured — the polls still carry the message. */
    enabled: z.boolean(),
  })
  .strict();
export type NotificationResult = z.infer<typeof NotificationResult>;
