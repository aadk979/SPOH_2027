import { z } from 'zod';
import { DataSource, VisitorCategory } from '../enums.js';
import { CaptureEnvelope, Id, IsoDateTime, ReasonText, TimeRangeQuery } from './common.js';

/**
 * COUNT 1 of the three counts (PRODUCT_BRIEF §0.1).
 *
 * A registration record is a category and a timestamp. There is deliberately
 * nowhere in this schema to put a name, a school, a phone number or a free-text
 * note — the no-visitor-PII rule is enforced by the shape of the DTO, not by a
 * policy memo (BUILD_PLAN §3.2).
 */

/** One tap at the booth. */
export const CreateRegistrationRequest = CaptureEnvelope.extend({
  category: VisitorCategory,
  stationId: Id,
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
    category: VisitorCategory,
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
    category: VisitorCategory,
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
    /** Category name, ISO hour, or ISO date depending on `groupBy`. */
    key: z.string(),
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
