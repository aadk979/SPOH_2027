import { z } from 'zod';
import { CommitteeRole, MembershipStatus } from '../../invariants/enums.js';
import { Id, IdempotencyKey, IsoDateTime, ReasonText } from '../common/index.js';
import { GoLiveCheckCode, GoLiveReadinessChecklist } from './goLiveReadiness.js';
export * from './goLiveReadiness.js';

/**
 * The event a caller works in, as the client needs it to show anything: its
 * name, and the wall clock (IANA timezone) and locale every date and time is
 * shown in (ADR-003 §6), never the device's.
 */
/** An event's lifecycle state (ADR-004). */
export const EventStatus = z.enum(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED']);
export type EventStatus = z.infer<typeof EventStatus>;

export const GoLiveOverride = z.object({ code: GoLiveCheckCode, reason: ReasonText }).strict();
export type GoLiveOverride = z.infer<typeof GoLiveOverride>;
const GoLiveOverrides = z
  .array(GoLiveOverride)
  .max(GoLiveCheckCode.options.length)
  .refine(
    (items) => new Set(items.map((item) => item.code)).size === items.length,
    'Each go-live check can be overridden only once',
  );

/** Shared manual/scheduled input; evidence and event identity always come from the server. */
export const LifecycleTransitionInput = z
  .object({
    to: z.enum(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED']),
    expectedVersion: z.number().int().nonnegative(),
    reason: ReasonText.optional(),
    goLiveOverrides: GoLiveOverrides.optional(),
  })
  .strict()
  .refine((request) => !request.goLiveOverrides?.length || request.to === 'LIVE', {
    path: ['goLiveOverrides'],
    message: 'Overrides apply only to go-live',
  });
export type LifecycleTransitionInput = z.infer<typeof LifecycleTransitionInput>;

/** LIVE reopening is supported; first go-live fails closed until its checklist is available. */
export const TransitionEventRequest = LifecycleTransitionInput.safeExtend({
  idempotencyKey: IdempotencyKey,
});
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

/** Advisory server guards; every transition checks current evidence again when it writes. */
export const LifecycleTransitionOption = z
  .object({
    to: EventStatus,
    allowed: z.boolean(),
    requiresReason: z.boolean(),
    blockers: z.array(z.string().min(1).max(100)).max(32),
  })
  .strict()
  .refine((option) => option.allowed === (option.blockers.length === 0));
export type LifecycleTransitionOption = z.infer<typeof LifecycleTransitionOption>;

export const LifecycleReadinessResponse = z
  .object({
    lifecycle: EventLifecycleState,
    evaluatedAt: IsoDateTime,
    reopenUntil: IsoDateTime.nullable(),
    goLiveReadiness: GoLiveReadinessChecklist,
    transitions: z.array(LifecycleTransitionOption).max(EventStatus.options.length),
  })
  .strict()
  .refine(
    (response) =>
      new Set(response.transitions.map((item) => item.to)).size === response.transitions.length,
  );
export type LifecycleReadinessResponse = z.infer<typeof LifecycleReadinessResponse>;

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
