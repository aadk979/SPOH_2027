import type { VolunteerAdminRecord } from '@spoh/shared';
import type { AdminRow } from './repo.js';

export function toAdminRecord(row: AdminRow): VolunteerAdminRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    portfolio: row.portfolio,
    reportsToId: row.reportsToId,
    reportsToName: row.reportsTo?.displayName ?? null,
    active: row.active,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    deactivatedReason: row.deactivatedReason,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    assignmentCount: row._count.shiftAssignments,
    deviceCount: row._count.pushSubscriptions,
    // The question the week before the event is not "does this account exist"
    // but "has this person ever actually opened the app".
    hasSignedIn: row.lastSeenAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
