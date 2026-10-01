import { z } from 'zod';

/**
 * Every enum here mirrors an enum in `server/prisma/schema.prisma` exactly.
 * They are declared as zod enums (not TS `enum`) so the same value list drives
 * runtime validation on both sides of the wire and type inference in both apps.
 *
 * If you change a member here you MUST change the Prisma enum and add a migration.
 */

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

/** Why a redemption synced from the offline queue needs an IC's attention (F03-034). */
export const RedemptionFlag = z.enum(['OVER_STOCK', 'SECOND_GIFT']);
export type RedemptionFlag = z.infer<typeof RedemptionFlag>;

/** How a volunteer's presence was confirmed: by a root admin, a scanned QR, or a PIN. */
export const AttendanceMethod = z.enum(['ROOT', 'QR', 'PIN']);
export type AttendanceMethod = z.infer<typeof AttendanceMethod>;

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

/** True when `actor` is strictly more privileged than `subject`: the escalation rule. */
export function outranks(actor: CommitteeRole, subject: CommitteeRole): boolean {
  return ROLE_PRECEDENCE[actor] < ROLE_PRECEDENCE[subject];
}

/** True when `role` is at least as privileged as `minimum`. */
export function roleMeets(role: CommitteeRole, minimum: CommitteeRole): boolean {
  return ROLE_PRECEDENCE[role] <= ROLE_PRECEDENCE[minimum];
}

/** The most privileged of a set of group memberships, or undefined if empty. */
export function highestRole(roles: readonly CommitteeRole[]): CommitteeRole | undefined {
  return roles.reduce<CommitteeRole | undefined>(
    (best, r) => (best === undefined || ROLE_PRECEDENCE[r] < ROLE_PRECEDENCE[best] ? r : best),
    undefined,
  );
}

/** How much an audit row matters (ADR-009 §4: the audit branch's migration, adopted in P09.1). */
export const AuditSeverity = z.enum(['INFO', 'NOTICE', 'WARNING', 'CRITICAL']);
export type AuditSeverity = z.infer<typeof AuditSeverity>;

/** Whether the audited action happened, was refused, or failed. */
export const AuditOutcome = z.enum(['SUCCESS', 'DENIED', 'FAILURE']);
export type AuditOutcome = z.infer<typeof AuditOutcome>;

/** Organisation-level access; platform admins own events and guardrails (ADR-001 §1). */
export const OrganisationRole = z.enum(['MEMBER', 'PLATFORM_ADMIN']);
export type OrganisationRole = z.infer<typeof OrganisationRole>;

/** A person's standing in one event (ADR-001 §1). */
export const MembershipStatus = z.enum(['INVITED', 'ACTIVE', 'DEACTIVATED', 'ENDED']);
export type MembershipStatus = z.infer<typeof MembershipStatus>;
