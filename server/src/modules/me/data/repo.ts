import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { SHIFT_REF_SELECT } from '../../../platform/db/shiftRef.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { STATION_WITH_TYPE } from '../../station/index.js';

/**
 * Data access for the caller's own profile, roster and escalation chain, in
 * the event the request works in (ADR-001 §2). Role, portfolio, standing and
 * reporting line are the membership's (ADR-001 §1).
 */

const assignmentInclude = {
  station: { include: STATION_WITH_TYPE },
  eventDay: true,
  shift: { select: SHIFT_REF_SELECT },
} satisfies Prisma.ShiftAssignmentInclude;

export type AssignmentWithContext = Prisma.ShiftAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

/** The caller as the event knows them: the person, with their membership. */
export async function findVolunteerById(scope: EventScope, id: string) {
  const membership = await prisma.eventMembership.findUnique({
    where: { eventId_personId: { eventId: scope.eventId, personId: id } },
    select: {
      role: true,
      portfolio: true,
      status: true,
      reportsToId: true,
      person: { select: { id: true, displayName: true, phone: true } },
    },
  });
  if (!membership) return null;
  return {
    ...membership.person,
    role: membership.role,
    portfolio: membership.portfolio,
    active: membership.status === 'ACTIVE',
    reportsToMembershipId: membership.reportsToId,
  };
}

/** All of this volunteer's assignments across the event, earliest first. */
export async function listAssignmentsForVolunteer(
  scope: EventScope,
  volunteerId: string,
): Promise<AssignmentWithContext[]> {
  return prisma.shiftAssignment.findMany({
    where: { eventId: scope.eventId, volunteerId },
    include: assignmentInclude,
    orderBy: [{ shift: { startsAt: 'asc' } }],
  });
}

/** Which of this volunteer's assignments are on a shift running now. */
export async function findRunningAssignmentIds(
  scope: EventScope,
  who: { volunteerId: string; running: Prisma.ShiftWhereInput },
): Promise<Set<string>> {
  const rows = await prisma.shiftAssignment.findMany({
    where: { eventId: scope.eventId, volunteerId: who.volunteerId, shift: who.running },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

export async function findAssignmentById(
  scope: EventScope,
  id: string,
): Promise<AssignmentWithContext | null> {
  return prisma.shiftAssignment.findFirst({
    where: { eventId: scope.eventId, id },
    include: assignmentInclude,
  });
}

export async function hasAttendance(
  tx: PrismaTransactionClient,
  scope: EventScope,
  where: { volunteerId: string; eventDayId: string },
): Promise<boolean> {
  const attendance = await tx.attendance.findUnique({
    where: { volunteerId_eventDayId: where, eventId: scope.eventId },
    select: { id: true },
  });
  return attendance !== null;
}

/** Sets the check-in only if it is still empty; false when it was not. */
export async function markCheckedIn(
  tx: PrismaTransactionClient,
  scope: EventScope,
  check: { id: string; volunteerId: string; at: Date },
): Promise<boolean> {
  const changed = await tx.shiftAssignment.updateMany({
    where: {
      eventId: scope.eventId,
      id: check.id,
      volunteerId: check.volunteerId,
      checkedInAt: null,
    },
    data: { checkedInAt: check.at },
  });
  return changed.count > 0;
}

/** Sets the check-out only if it is still empty; false when it was not. */
export async function markCheckedOut(
  tx: PrismaTransactionClient,
  scope: EventScope,
  check: { id: string; at: Date },
): Promise<boolean> {
  const changed = await tx.shiftAssignment.updateMany({
    where: { eventId: scope.eventId, id: check.id, checkedInAt: { not: null }, checkedOutAt: null },
    data: { checkedOutAt: check.at },
  });
  return changed.count > 0;
}

/**
 * Walk the memberships' `reportsTo` upwards to build the escalation chain: my
 * IC, my Deputy Coordinator, the Chief. Bounded rather than recursive — a
 * cycle in the hierarchy is a data error, not a reason to hang a request.
 */
export async function buildEscalationChain(
  scope: EventScope,
  startMembershipId: string | null,
  maxDepth = 5,
) {
  const chain: Array<{
    id: string;
    displayName: string;
    role: Prisma.EventMembershipGetPayload<object>['role'];
    phone: string | null;
    portfolio: string | null;
  }> = [];

  const seen = new Set<string>();
  let currentId = startMembershipId;

  for (let depth = 0; depth < maxDepth && currentId && !seen.has(currentId); depth += 1) {
    seen.add(currentId);

    const membership = await prisma.eventMembership.findFirst({
      where: { eventId: scope.eventId, id: currentId },
      select: {
        role: true,
        portfolio: true,
        status: true,
        reportsToId: true,
        person: { select: { id: true, displayName: true, phone: true } },
      },
    });

    if (!membership) break;
    if (membership.status === 'ACTIVE') {
      chain.push({
        id: membership.person.id,
        displayName: membership.person.displayName,
        role: membership.role,
        phone: membership.person.phone,
        portfolio: membership.portfolio,
      });
    }

    currentId = membership.reportsToId;
  }

  return chain;
}
