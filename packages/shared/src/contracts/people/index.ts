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
