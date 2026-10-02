import { z } from 'zod';
import { CommitteeRole, MembershipStatus } from '../../invariants/enums.js';
import { Id, IdempotencyKey, ReasonText } from '../common/index.js';

/**
 * The event a caller works in, as the client needs it to show anything: its
 * name, and the wall clock (IANA timezone) and locale every date and time is
 * shown in (ADR-003 §6), never the device's.
 */
/** An event's lifecycle state (ADR-004). */
export const EventStatus = z.enum(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED']);
export type EventStatus = z.infer<typeof EventStatus>;

/** LIVE reopening is supported; first go-live fails closed until its checklist is available. */
export const TransitionEventRequest = z
  .object({
    idempotencyKey: IdempotencyKey,
    to: z.enum(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED']),
    expectedVersion: z.number().int().nonnegative(),
    reason: ReasonText.optional(),
  })
  .strict();
export type TransitionEventRequest = z.infer<typeof TransitionEventRequest>;

export const EventLifecycleState = z
  .object({
    eventId: Id,
    status: EventStatus,
    version: z.number().int().nonnegative(),
    hasBeenLive: z.boolean(),
  })
  .strict();
export type EventLifecycleState = z.infer<typeof EventLifecycleState>;
export const EventLifecycleResponse = z.object({ lifecycle: EventLifecycleState }).strict();
export type EventLifecycleResponse = z.infer<typeof EventLifecycleResponse>;

export const EventSummary = z
  .object({
    id: Id,
    name: z.string(),
    timezone: z.string(),
    locale: z.string(),
    /** REHEARSAL marks everything recorded as practice data (ADR-004). */
    status: EventStatus,
  })
  .strict();
export type EventSummary = z.infer<typeof EventSummary>;

/** One of the caller's events, with their membership of it. */
export const MyEvent = EventSummary.extend({
  /** For people and the client's `/e/<slug>/…` paths; the API always takes the id. */
  slug: z.string(),
  status: EventStatus,
  role: CommitteeRole,
  membershipStatus: MembershipStatus,
  /**
   * The event the pre-P09.7 paths serve (ADR-009 §6): an outbox entry the old
   * build queued belongs to it.
   */
  servesLegacyPaths: z.boolean(),
}).strict();
export type MyEvent = z.infer<typeof MyEvent>;

/** `GET /events`: the caller's events, oldest first. Archived events are not listed. */
export const MyEventsResponse = z.object({ data: z.array(MyEvent) }).strict();
export type MyEventsResponse = z.infer<typeof MyEventsResponse>;

/** An event's slug: lower case, digits and hyphens, for `/e/<slug>/…`. */
export const EventSlug = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{1,47}$/, 'Use lower-case letters, digits and hyphens');
export type EventSlug = z.infer<typeof EventSlug>;

/**
 * Clone an event's structure into a new event in DRAFT (ADR-001 §6): its days
 * moved by `dayOffsetDays`, and its people invited again only when asked.
 */
export const CloneEventRequest = z
  .object({
    slug: EventSlug,
    name: z.string().trim().min(2).max(120),
    dayOffsetDays: z.number().int().min(-3660).max(3660),
    inviteSamePeople: z.boolean().default(false),
  })
  .strict();
export type CloneEventRequest = z.infer<typeof CloneEventRequest>;
