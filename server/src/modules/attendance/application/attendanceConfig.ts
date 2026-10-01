import type { AttendanceConfig } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { resolveSetting } from '../../../platform/settings/resolve.js';
import { storedSetting } from '../../../platform/settings/scopedStore.js';

/** Active administrators of this event are the only valid root choices. */
async function eligibleRoots(scope: EventScope): Promise<AttendanceConfig['eligibleRoots']> {
  const members = await prisma.eventMembership.findMany({
    where: { eventId: scope.eventId, role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true, person: { select: { displayName: true, email: true } } },
  });
  return members
    .map((member) => ({ id: member.id, ...member.person }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
}

/** Values and versions for the attendance setup controls. */
export async function attendanceConfig(scope: EventScope): Promise<AttendanceConfig> {
  const target = { scope: 'event' as const, eventId: scope.eventId };
  const [rootRow, cidrsRow, roots] = await Promise.all([
    storedSetting(target, 'attendance.rootMembershipId'),
    storedSetting(target, 'attendance.campusCidrs'),
    eligibleRoots(scope),
  ]);
  const root = resolveSetting(
    'attendance.rootMembershipId',
    rootRow ? [{ scope: 'event', ...rootRow }] : [],
  ).value as string | null;
  const campusCidrs = resolveSetting(
    'attendance.campusCidrs',
    cidrsRow ? [{ scope: 'event', ...cidrsRow }] : [],
  ).value as string[];
  return {
    rootMembershipId: root,
    rootIsStale: root !== null && !roots.some((candidate) => candidate.id === root),
    campusCidrs,
    versions: { rootMembershipId: rootRow?.version ?? 0, campusCidrs: cidrsRow?.version ?? 0 },
    eligibleRoots: roots,
  };
}
