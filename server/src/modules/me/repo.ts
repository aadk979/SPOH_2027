import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

/** Data access for the caller's own profile, roster and escalation chain. */

const assignmentInclude = {
  station: true,
  eventDay: true,
} satisfies Prisma.ShiftAssignmentInclude;

export type AssignmentWithContext = Prisma.ShiftAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

export async function findVolunteerById(id: string) {
  return prisma.volunteer.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      role: true,
      portfolio: true,
      phone: true,
      active: true,
      reportsToId: true,
    },
  });
}

/** All of this volunteer's assignments across the event, earliest first. */
export async function listAssignmentsForVolunteer(
  volunteerId: string,
): Promise<AssignmentWithContext[]> {
  return prisma.shiftAssignment.findMany({
    where: { volunteerId },
    include: assignmentInclude,
    orderBy: [{ eventDay: { date: 'asc' } }, { block: 'asc' }],
  });
}

export async function findAssignmentById(id: string): Promise<AssignmentWithContext | null> {
  return prisma.shiftAssignment.findUnique({ where: { id }, include: assignmentInclude });
}

export async function setAssignmentCheckIn(id: string, at: Date): Promise<AssignmentWithContext> {
  return prisma.shiftAssignment.update({
    where: { id },
    data: { checkedInAt: at },
    include: assignmentInclude,
  });
}

export async function setAssignmentCheckOut(id: string, at: Date): Promise<AssignmentWithContext> {
  return prisma.shiftAssignment.update({
    where: { id },
    data: { checkedOutAt: at },
    include: assignmentInclude,
  });
}

/**
 * Walk `reportsTo` upwards to build the escalation chain: my IC, my Deputy
 * Coordinator, the Chief. Bounded rather than recursive — a cycle in the
 * hierarchy is a data error, not a reason to hang a request.
 */
export async function buildEscalationChain(startId: string | null, maxDepth = 5) {
  const chain: Array<{
    id: string;
    displayName: string;
    role: Prisma.VolunteerGetPayload<object>['role'];
    phone: string | null;
    portfolio: string | null;
  }> = [];

  const seen = new Set<string>();
  let currentId = startId;

  for (let depth = 0; depth < maxDepth && currentId && !seen.has(currentId); depth += 1) {
    seen.add(currentId);

    const person = await prisma.volunteer.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        displayName: true,
        role: true,
        phone: true,
        portfolio: true,
        reportsToId: true,
        active: true,
      },
    });

    if (!person) break;
    if (person.active) {
      chain.push({
        id: person.id,
        displayName: person.displayName,
        role: person.role,
        phone: person.phone,
        portfolio: person.portfolio,
      });
    }

    currentId = person.reportsToId;
  }

  return chain;
}
