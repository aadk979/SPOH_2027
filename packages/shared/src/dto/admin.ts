import { z } from 'zod';
import { CommitteeRole, CourseCode, ShiftBlock, StationKind } from '../enums.js';
import { Id, IsoDate, IsoDateTime, PaginationQuery, ReasonText } from './common.js';
import { ShiftAssignmentRecord, VolunteerPhone, VolunteerRecord } from './roster.js';

/**
 * Administration: the people, the places and the days.
 *
 * Everything here was previously either impossible through the API or expressed
 * only in `prisma/seed.ts`. Seeding is how you get a development database, not
 * how you run an event — a station added on the morning of 7 January, a
 * volunteer who has to be locked out because they lost their phone, and a
 * fourth event day nobody planned for are all ordinary, and none of them should
 * need a deploy.
 *
 * Authorization is deliberately split. `user.read` sees the roster; only
 * `user.provision` changes it; `config.manage` changes what the event *is*.
 */

// ─────────────────────────────────────────────────────────────
// VOLUNTEERS
// ─────────────────────────────────────────────────────────────

export const ListVolunteersQuery = PaginationQuery.extend({
  /** Matches display name or email, case-insensitively. */
  q: z.string().trim().max(120).optional(),
  role: CommitteeRole.optional(),
  /** Omit to see everyone; the screen defaults to active only. */
  active: z.stringbool().optional(),
  /** Everyone rostered at this station on any day. */
  stationId: Id.optional(),
  eventDayId: Id.optional(),
  sort: z.enum(['name', 'role', 'lastSeen', 'created']).default('name'),
}).strict();
export type ListVolunteersQuery = z.infer<typeof ListVolunteersQuery>;

/**
 * A roster row with the operational context an admin needs to act on it: who
 * they report to, how many shifts they hold, and whether they have ever
 * actually signed in — which is the question that matters in the week before
 * the event and is invisible on the volunteer record alone.
 */
export const VolunteerAdminRecord = VolunteerRecord.extend({
  reportsToName: z.string().nullable(),
  deactivatedAt: IsoDateTime.nullable(),
  deactivatedReason: z.string().nullable(),
  lastSeenAt: IsoDateTime.nullable(),
  assignmentCount: z.number().int().nonnegative(),
  /** Distinct devices with a live push subscription. */
  deviceCount: z.number().int().nonnegative(),
  /** True once the volunteer has authenticated at least once. */
  hasSignedIn: z.boolean(),
}).strict();
export type VolunteerAdminRecord = z.infer<typeof VolunteerAdminRecord>;

/**
 * Partial update. Absent keys are left alone, which is what makes this safe to
 * call from a form that only ever renders half the fields.
 *
 * `reportsToId` is nullable rather than merely optional: clearing a reporting
 * line is a real edit, and `undefined` cannot express it.
 */
export const UpdateVolunteerRequest = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: VolunteerPhone.nullish(),
    role: CommitteeRole.optional(),
    portfolio: z.string().trim().max(120).nullish(),
    reportsToId: Id.nullish(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateVolunteerRequest = z.infer<typeof UpdateVolunteerRequest>;

/**
 * Withdrawing access. A reason is mandatory — "why is this person locked out"
 * is asked at the worst possible moment, and an unexplained deactivation on the
 * morning of the event is indistinguishable from a mistake.
 */
export const DeactivateVolunteerRequest = z
  .object({
    reason: ReasonText,
    /**
     * Also disable the account at the identity provider. Default true: a
     * volunteer who lost their phone needs the credential dead, not just the
     * roster row flagged. Set false to suspend someone who is coming back.
     */
    disableIdentity: z.boolean().default(true),
  })
  .strict();
export type DeactivateVolunteerRequest = z.infer<typeof DeactivateVolunteerRequest>;

export const VolunteerMutationResponse = z
  .object({
    volunteer: VolunteerAdminRecord,
    /** Refresh sessions invalidated by this change. */
    sessionsRevoked: z.number().int().nonnegative(),
    /** True when the identity provider account was disabled or re-enabled. */
    identityChanged: z.boolean(),
  })
  .strict();
export type VolunteerMutationResponse = z.infer<typeof VolunteerMutationResponse>;

/**
 * One person, with the shifts they hold. The list endpoint carries only a
 * count, because 200 rows each dragging their assignments along is a slow
 * screen; the detail is fetched when a row is opened.
 */
export const VolunteerDetailResponse = z
  .object({
    volunteer: VolunteerAdminRecord,
    assignments: z.array(ShiftAssignmentRecord),
  })
  .strict();
export type VolunteerDetailResponse = z.infer<typeof VolunteerDetailResponse>;

/**
 * "I never got the email" is the most common support request in the week
 * before the event. What gets sent depends on where the account is:
 *
 *  - `invite`   they have never set a password, so the original invite with a
 *               fresh temporary password is resent.
 *  - `reset`    they have signed in before, so a password-reset code is sent
 *               and they use "Forgot password" at the sign-in screen.
 *  - `none`     the identity provider has no email to send (local dev).
 */
export const ResendInviteResponse = z
  .object({
    volunteer: VolunteerAdminRecord,
    delivery: z.enum(['invite', 'reset', 'none']),
  })
  .strict();
export type ResendInviteResponse = z.infer<typeof ResendInviteResponse>;

/** Manual roster edit, for the shifts an import did not cover. */
export const CreateAssignmentRequest = z
  .object({
    volunteerId: Id,
    stationId: Id,
    eventDayId: Id,
    block: ShiftBlock,
    roleLabel: z.string().trim().min(1).max(64).default('Volunteer'),
  })
  .strict();
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequest>;

// ─────────────────────────────────────────────────────────────
// STATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Station codes are referenced by every fallback import CSV, so they are
 * constrained to something a person can type into a spreadsheet without
 * ambiguity and are immutable once created.
 */
export const StationCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_]+$/, 'use A-Z, 0-9 and underscores only');

export const CreateStationRequest = z
  .object({
    code: StationCode,
    name: z.string().trim().min(1).max(120),
    kind: StationKind,
    courseCode: CourseCode.nullish(),
    floor: z.string().trim().max(40).nullish(),
    countsEntry: z.boolean().default(false),
    issuesStamp: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
export type CreateStationRequest = z.infer<typeof CreateStationRequest>;

/**
 * `code` is absent by design: it is the join key for every import file and
 * every seeded roster CSV, and renaming it would silently orphan them.
 */
export const UpdateStationRequest = CreateStationRequest.omit({ code: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateStationRequest = z.infer<typeof UpdateStationRequest>;

// ─────────────────────────────────────────────────────────────
// EVENT DAYS
// ─────────────────────────────────────────────────────────────

export const EventDayRecord = z
  .object({
    id: Id,
    date: IsoDate,
    label: z.string(),
    isPublicDay: z.boolean(),
    isTourDay: z.boolean(),
    assignmentCount: z.number().int().nonnegative(),
    createdAt: IsoDateTime,
  })
  .strict();
export type EventDayRecord = z.infer<typeof EventDayRecord>;

export const CreateEventDayRequest = z
  .object({
    date: IsoDate,
    label: z.string().trim().min(1).max(120),
    isPublicDay: z.boolean().default(true),
    isTourDay: z.boolean().default(false),
  })
  .strict();
export type CreateEventDayRequest = z.infer<typeof CreateEventDayRequest>;

export const UpdateEventDayRequest = CreateEventDayRequest.omit({ date: true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateEventDayRequest = z.infer<typeof UpdateEventDayRequest>;

// ─────────────────────────────────────────────────────────────
// GIFT TYPES
// ─────────────────────────────────────────────────────────────

export const CreateGiftTypeRequest = z
  .object({
    name: z.string().trim().min(1).max(120),
    initialStock: z.number().int().min(0).max(1_000_000),
    lowStockThreshold: z.number().int().min(0).max(1_000_000).default(50),
  })
  .strict();
export type CreateGiftTypeRequest = z.infer<typeof CreateGiftTypeRequest>;

/**
 * `initialStock` is absent on purpose. Stock is derived — initial plus
 * adjustments minus redemptions — so editing the opening figure after
 * redemptions have started would rewrite history rather than correct it. A
 * miscount is an adjustment, which is audited and carries a reason.
 */
export const UpdateGiftTypeRequest = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateGiftTypeRequest = z.infer<typeof UpdateGiftTypeRequest>;
