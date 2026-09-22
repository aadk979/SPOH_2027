import { z } from 'zod';

/**
 * Every enum here mirrors an enum in `server/prisma/schema.prisma` exactly.
 * They are declared as zod enums (not TS `enum`) so the same value list drives
 * runtime validation on both sides of the wire and type inference in both apps.
 *
 * If you change a member here you MUST change the Prisma enum and add a migration.
 */

/** The eight sign-up booth buttons, matching the booth screen one for one. */
export const VisitorCategory = z.enum([
  'SEC_1',
  'SEC_2',
  'SEC_3',
  'SEC_4',
  'SEC_5',
  'GRADUATED_AWAITING_RESULTS',
  'PARENT_GUARDIAN',
  'OTHER',
]);
export type VisitorCategory = z.infer<typeof VisitorCategory>;

export const StationKind = z.enum([
  'SIGNUP_BOOTH',
  'WELCOME_LOUNGE',
  'COURSE_STATION',
  'MISSION_COMPLETE',
  'WELCOME_PARTY',
  'OTHER',
]);
export type StationKind = z.infer<typeof StationKind>;

export const CourseCode = z.enum(['DAAA', 'DCDF', 'DCS', 'DCITP']);
export type CourseCode = z.infer<typeof CourseCode>;

export const CommitteeRole = z.enum([
  'VOLUNTEER',
  'IC',
  'DEPUTY_COORDINATOR',
  'CHIEF_COORDINATOR',
  'LEAD',
  'ADMIN',
]);
export type CommitteeRole = z.infer<typeof CommitteeRole>;

/**
 * Provenance of a captured row. Reports must never silently blend sources
 * (PRODUCT_BRIEF §11.4), so this travels with every capture record.
 */
export const DataSource = z.enum(['APP', 'FALLBACK_SHEET', 'PAPER', 'MANUAL_ADJUSTMENT']);
export type DataSource = z.infer<typeof DataSource>;

export const ShiftBlock = z.enum(['MORNING', 'AFTERNOON']);
export type ShiftBlock = z.infer<typeof ShiftBlock>;

export const SwapStatus = z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED']);
export type SwapStatus = z.infer<typeof SwapStatus>;

export const IncidentType = z.enum([
  'INJURY',
  'ILLNESS',
  'NEAR_MISS',
  'SAFETY_CONCERN',
  'CROWD_CONCERN',
  'EQUIPMENT',
  'OTHER',
]);
export type IncidentType = z.infer<typeof IncidentType>;

export const IncidentSeverity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type IncidentSeverity = z.infer<typeof IncidentSeverity>;

export const IncidentStatus = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const LostPersonStatus = z.enum(['ACTIVE', 'RESOLVED_FOUND', 'RESOLVED_OTHER']);
export type LostPersonStatus = z.infer<typeof LostPersonStatus>;

export const LostFoundStatus = z.enum(['HELD', 'CLAIMED', 'UNCLAIMED_AT_CLOSE', 'DISPOSED']);
export type LostFoundStatus = z.infer<typeof LostFoundStatus>;

export const CardStatus = z.enum(['UNISSUED', 'ISSUED', 'COMPLETED', 'VOIDED', 'LOST']);
export type CardStatus = z.infer<typeof CardStatus>;

export const AnnouncementPriority = z.enum(['INFO', 'OPERATIONAL', 'URGENT']);
export type AnnouncementPriority = z.infer<typeof AnnouncementPriority>;

/**
 * Role precedence, lowest number = highest privilege. Mirrors the Cognito group
 * precedence in BUILD_PLAN §6.1 so client and server rank roles identically.
 */
export const ROLE_PRECEDENCE: Readonly<Record<CommitteeRole, number>> = Object.freeze({
  ADMIN: 0,
  LEAD: 10,
  CHIEF_COORDINATOR: 20,
  DEPUTY_COORDINATOR: 30,
  IC: 40,
  VOLUNTEER: 50,
});

/** True when `role` is at least as privileged as `minimum`. */
export function roleMeets(role: CommitteeRole, minimum: CommitteeRole): boolean {
  return ROLE_PRECEDENCE[role] <= ROLE_PRECEDENCE[minimum];
}

/**
 * True when `actor` is strictly more privileged than `subject`.
 *
 * The administration rule, in one place for the server that enforces it and
 * the client that hides the controls: nobody edits, provisions or imports an
 * account at or above their own level, or `user.provision` would be a
 * permission to become an Admin.
 */
export function outranks(actor: CommitteeRole, subject: CommitteeRole): boolean {
  return ROLE_PRECEDENCE[actor] < ROLE_PRECEDENCE[subject];
}

/** The most privileged of a set of group memberships, or undefined if empty. */
export function highestRole(roles: readonly CommitteeRole[]): CommitteeRole | undefined {
  return roles.reduce<CommitteeRole | undefined>(
    (best, r) => (best === undefined || ROLE_PRECEDENCE[r] < ROLE_PRECEDENCE[best] ? r : best),
    undefined,
  );
}
