import { z } from 'zod';
import { VisitorValues } from '../visitor/index.js';
import { DataSource } from '../../invariants/enums.js';
import { CaptureEnvelope, Id, IsoDateTime, ReasonText, TimeRangeQuery } from '../common/index.js';

/**
 * COUNT 1 of the three counts (PRODUCT_BRIEF §0.1).
 *
 * A registration record is a category and a timestamp. There is deliberately
 * nowhere in this schema to put a name, a school, a phone number or a free-text
 * note — the no-visitor-PII rule is enforced by the shape of the DTO, not by a
 * policy memo (BUILD_PLAN §3.2).
 */

/**
 * A capture category's code, as the event defines it (ADR-002): the booth's
 * buttons are the event's categories, not a list compiled into the app. The
 * server checks it against the event's own categories.
 */
export const CategoryCode = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_]{1,40}$/, 'Not a category code');
export type CategoryCode = z.infer<typeof CategoryCode>;

/** One of the event's capture categories, in the booth's order. */
export const CaptureCategoryRecord = z.object({ code: CategoryCode, label: z.string() }).strict();
export type CaptureCategoryRecord = z.infer<typeof CaptureCategoryRecord>;

/** `GET /registrations/categories`: the event's active categories, in order. */
export const CaptureCategoriesResponse = z
  .object({ data: z.array(CaptureCategoryRecord) })
  .strict();
export type CaptureCategoriesResponse = z.infer<typeof CaptureCategoriesResponse>;

/** One tap at the booth. */
export const CreateRegistrationRequest = CaptureEnvelope.extend({
  category: CategoryCode,
  stationId: Id,
  /**
   * The event's declared visitor fields, in `allowlist` mode only (ADR-002
   * §4). Stored apart from the registration, never echoed back.
   */
  visitor: VisitorValues.optional(),
}).strict();
export type CreateRegistrationRequest = z.infer<typeof CreateRegistrationRequest>;

/**
 * A family arriving together: four humans, one Mission Card. Writing four
 * registration rows and one card link is how the family-of-four problem gets
 * handled honestly rather than fudged into whichever number looks better
 * (PRODUCT_BRIEF §2.2).
 */
export const GroupMember = z
  .object({
    category: CategoryCode,
    count: z.number().int().min(1).max(20),
  })
  .strict();
export type GroupMember = z.infer<typeof GroupMember>;

export const CreateGroupRegistrationRequest = CaptureEnvelope.extend({
  stationId: Id,
  members: z.array(GroupMember).min(1).max(8),
  /** Optional. A failed card link must never block the registration count. */
  missionCardShortCode: z.string().trim().length(6).optional(),
})
  .strict()
  .refine((body) => body.members.reduce((sum, m) => sum + m.count, 0) <= 20, {
    message: 'A group may not exceed 20 people',
    path: ['members'],
  });
export type CreateGroupRegistrationRequest = z.infer<typeof CreateGroupRegistrationRequest>;

export const RegistrationRecord = z
  .object({
    id: Id,
    category: CategoryCode,
    /** The event's label for the category (P09.10). */
    categoryLabel: z.string(),
    stationId: Id,
    groupId: Id.nullable(),
    missionCardId: Id.nullable(),
    source: DataSource,
    recordedAt: IsoDateTime,
    clientRecordedAt: IsoDateTime.nullable(),
    voided: z.boolean(),
  })
  .strict();
export type RegistrationRecord = z.infer<typeof RegistrationRecord>;

export const CreateRegistrationResponse = z
  .object({
    registration: RegistrationRecord,
    /** Running totals so the booth screen never has to make a second call. */
    sessionTotal: z.number().int().nonnegative(),
    boothTotal: z.number().int().nonnegative(),
  })
  .strict();
export type CreateRegistrationResponse = z.infer<typeof CreateRegistrationResponse>;

export const CreateGroupRegistrationResponse = z
  .object({
    groupId: Id,
    registrations: z.array(RegistrationRecord),
    /** Null when the card link failed — the registrations still stand. */
    linkedCardId: Id.nullable(),
    cardLinkError: z.string().nullable(),
    boothTotal: z.number().int().nonnegative(),
  })
  .strict();
export type CreateGroupRegistrationResponse = z.infer<typeof CreateGroupRegistrationResponse>;

export const VoidRegistrationRequest = z.object({ reason: ReasonText }).strict();
export type VoidRegistrationRequest = z.infer<typeof VoidRegistrationRequest>;

export const RegistrationSummaryQuery = TimeRangeQuery.extend({
  eventDayId: Id.optional(),
  stationId: Id.optional(),
  groupBy: z.enum(['category', 'hour', 'day']).default('category'),
}).strict();
export type RegistrationSummaryQuery = z.infer<typeof RegistrationSummaryQuery>;

export const RegistrationSummaryBucket = z
  .object({
    /** Category code, ISO hour, or ISO date depending on `groupBy`. */
    key: z.string(),
    /** The event's label for a category bucket (P09.5); absent for time buckets. */
    label: z.string().optional(),
    value: z.number().int().nonnegative(),
  })
  .strict();
export type RegistrationSummaryBucket = z.infer<typeof RegistrationSummaryBucket>;

export const RegistrationSummaryResponse = z
  .object({
    unit: z.literal('registrations'),
    groupBy: z.enum(['category', 'hour', 'day']),
    total: z.number().int().nonnegative(),
    buckets: z.array(RegistrationSummaryBucket),
    /** True when the range overlaps a declared fallback window (§11.4). */
    containsFallbackData: z.boolean(),
  })
  .strict();
export type RegistrationSummaryResponse = z.infer<typeof RegistrationSummaryResponse>;
