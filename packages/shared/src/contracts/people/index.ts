import { z } from 'zod';
import { CommitteeRole } from '../../invariants/enums.js';
import { Id, IsoDateTime, PaginationQuery, ReasonText } from '../common/index.js';
import { VolunteerPhone, VolunteerRecord } from '../roster/index.js';

/**
 * Administering volunteers: the roster as an admin sees and changes it.
 *
 * A volunteer who has to be locked out because they lost their phone is
 * ordinary, and must not need a deploy. Authorization is deliberately split:
 * `user.read` sees the roster; only `user.provision` changes it.
 */

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
  status: z.enum(['INVITED', 'ACTIVE', 'DEACTIVATED', 'ENDED']).optional(),
  invitedAt: IsoDateTime.nullable().optional(),
  acceptedAt: IsoDateTime.nullable().optional(),
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
    idempotencyKey: z.uuid().optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: VolunteerPhone.nullish(),
    role: CommitteeRole.optional(),
    portfolio: z.string().trim().max(120).nullish(),
    reportsToId: Id.nullish(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).some((key) => key !== 'idempotencyKey'), {
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
    idempotencyKey: z.uuid().optional(),
    reason: ReasonText,
    /**
     * Legacy clients may send this field. Event suspension always leaves the
     * identity usable in other events; global suspension is a platform action.
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

export const BulkPeopleRequest = z
  .object({
    idempotencyKey: z.uuid().optional(),
    ids: z.array(Id).min(1).max(100),
    action: z.enum(['resend', 'deactivate', 'role']),
    reason: ReasonText.optional(),
    role: CommitteeRole.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.action === 'deactivate' && !input.reason)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required' });
    if (input.action === 'role' && !input.role)
      ctx.addIssue({ code: 'custom', path: ['role'], message: 'A role is required' });
  });
export type BulkPeopleRequest = z.infer<typeof BulkPeopleRequest>;

export const BulkPeopleResponse = z
  .object({
    data: z.array(z.object({ id: Id, ok: z.boolean(), error: z.string().optional() }).strict()),
    meta: z.object({ count: z.number().int().nonnegative() }).strict(),
  })
  .strict();
export type BulkPeopleResponse = z.infer<typeof BulkPeopleResponse>;
export const PersonDetailResponse = z
  .object({
    person: z
      .object({
        id: Id,
        displayName: z.string(),
        email: z.string(),
        deactivatedAt: IsoDateTime.nullable(),
      })
      .strict(),
    memberships: z.array(
      z
        .object({
          id: Id,
          eventId: Id,
          eventName: z.string(),
          role: CommitteeRole,
          status: z.enum(['INVITED', 'ACTIVE', 'DEACTIVATED', 'ENDED']),
          acceptedAt: IsoDateTime.nullable(),
          lastSeenAt: IsoDateTime.nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type PersonDetailResponse = z.infer<typeof PersonDetailResponse>;
export const DeactivatePersonRequest = z
  .object({ reason: ReasonText, idempotencyKey: z.uuid().optional() })
  .strict();
export type DeactivatePersonRequest = z.infer<typeof DeactivatePersonRequest>;
export const IdentityMutationResponse = z
  .object({ identityChanged: z.boolean(), sessionsRevoked: z.number().int().nonnegative() })
  .strict();
export type IdentityMutationResponse = z.infer<typeof IdentityMutationResponse>;
export const InviteResendResponse = z.object({ sent: z.boolean() }).strict();
export type InviteResendResponse = z.infer<typeof InviteResendResponse>;
export const SignOutPersonResponse = z
  .object({ sessionsRevoked: z.number().int().nonnegative() })
  .strict();
export type SignOutPersonResponse = z.infer<typeof SignOutPersonResponse>;

const PersonalInstant = IsoDateTime.nullable();
export const PersonDataExportResponse = z.object({
  data: z.object({
    person: z.object({ id: Id, displayName: z.string(), email: z.string(), phone: z.string().nullable(),
      createdAt: IsoDateTime, lastSeenAt: PersonalInstant, deactivatedAt: PersonalInstant, piiErasedAt: PersonalInstant,
      eventMemberships: z.array(z.object({ id: Id, eventId: Id, role: CommitteeRole,
        portfolio: z.string().nullable(), status: z.enum(['INVITED', 'ACTIVE', 'DEACTIVATED', 'ENDED']),
        invitedAt: PersonalInstant, acceptedAt: PersonalInstant, deactivatedAt: PersonalInstant,
        deactivatedReason: z.string().nullable(), lastSeenAt: PersonalInstant }).strict()),
      refreshSessions: z.array(z.object({ id: Id, issuedAt: IsoDateTime, expiresAt: IsoDateTime,
        revokedAt: PersonalInstant, revokedReason: z.string().nullable(), userAgent: z.string().nullable(), lastUsedAt: PersonalInstant }).strict()),
      pushSubscriptions: z.array(z.object({ id: Id, userAgent: z.string().nullable(), createdAt: IsoDateTime, lastSeenAt: IsoDateTime }).strict()),
    }).strict(),
    activity: z.array(z.object({ id: Id, eventId: Id.nullable(), action: z.string(), entityType: z.string(),
      entityId: z.string().nullable(), createdAt: IsoDateTime }).strict()),
  }).strict(),
  retained: z.array(z.string()),
}).strict();
export type PersonDataExportResponse = z.infer<typeof PersonDataExportResponse>;
export const ErasePersonRequest = DeactivatePersonRequest;
export type ErasePersonRequest = z.infer<typeof ErasePersonRequest>;
export const ErasePersonResponse = IdentityMutationResponse;
export type ErasePersonResponse = z.infer<typeof ErasePersonResponse>;
