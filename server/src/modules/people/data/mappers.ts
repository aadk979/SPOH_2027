import type { VolunteerAdminRecord } from '@spoh/shared';
import type { AdminRow } from './repo.js';

type Membership = AdminRow['eventMemberships'][number];

/** Who they report to in this event. */
function reportingLine(membership: Membership) {
  const manager = membership.reportsTo?.person;
  return manager
    ? { reportsToId: manager.id, reportsToName: manager.displayName }
    : { reportsToId: null, reportsToName: null };
}

/** What the membership says about someone in this event: role, line and standing. */
function standingIn(membership: Membership) {
  return {
    role: membership.role,
    portfolio: membership.portfolio,
    ...reportingLine(membership),
    active: membership.status === 'ACTIVE',
    deactivatedAt: membership.deactivatedAt?.toISOString() ?? null,
    deactivatedReason: membership.deactivatedReason,
    lastSeenAt: membership.lastSeenAt?.toISOString() ?? null,
    // The question the week before the event is not "does this account exist"
    // but "has this person ever actually opened the app".
    hasSignedIn: membership.lastSeenAt !== null,
  };
}

/** A member of the event as the admin screens show them (ADR-001 §1). */
export function toAdminRecord(row: AdminRow): VolunteerAdminRecord {
  const [membership] = row.eventMemberships;
  // Rows come from queries that require a membership of the event.
  if (!membership) throw new Error(`person ${row.id} has no membership of this event`);
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    ...standingIn(membership),
    assignmentCount: row._count.shiftAssignments,
    deviceCount: row._count.pushSubscriptions,
    createdAt: row.createdAt.toISOString(),
  };
}
