import type { RecordsFilter, SearchRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const memberReference = { id: true, personId: true, person: { select: { displayName: true } } } as const;
const memberProfile = { ...memberReference, role: true, portfolio: true, status: true,
  person: { select: { displayName: true, email: true, phone: true } },
  reportsTo: { select: { personId: true, person: { select: { displayName: true } } } } } as const;
export type WorkspacePerson = Prisma.EventMembershipGetPayload<{ select: typeof memberProfile }>;
export type WorkspacePersonReference = Prisma.EventMembershipGetPayload<{ select: typeof memberReference }>;

export function personProfile(scope: EventScope, db: PrismaTransactionClient, personId: string) {
  return db.eventMembership.findFirst({ where: { eventId: scope.eventId, personId }, select: memberProfile });
}

export function ownPersonReference(scope: EventScope, db: PrismaTransactionClient,
  input: { personId: string; membershipId: string }) {
  return db.eventMembership.findFirst({ where: { eventId: scope.eventId,
    id: input.membershipId, personId: input.personId }, select: memberReference });
}

export function personViaAssignmentProof(scope: EventScope, db: PrismaTransactionClient,
  input: { assignmentId: string; personId: string }) {
  return db.shiftAssignment.findFirst({ where: { eventId: scope.eventId, id: input.assignmentId,
    volunteerId: input.personId }, select: { id: true, volunteerId: true, membershipId: true,
    stationId: true, shiftId: true, eventDayId: true } });
}

/** Keep the persisted relation in the final named read, after its authority check. */
export function personViaAssignment(scope: EventScope, db: PrismaTransactionClient,
  input: { assignmentId: string; personId: string; stationId: string }) {
  return db.eventMembership.findFirst({ where: { eventId: scope.eventId, personId: input.personId,
    person: { shiftAssignments: { some: { eventId: scope.eventId, id: input.assignmentId,
      volunteerId: input.personId, stationId: input.stationId } } } }, select: memberReference });
}

type PeopleFilter = Extract<RecordsFilter, { kind: 'people' }>;
function peopleWhere(scope: EventScope, filter: PeopleFilter): Prisma.EventMembershipWhereInput {
  return { eventId: scope.eventId, ...(filter.status ? { status: filter.status } : {}),
    ...(filter.personId ? { personId: filter.personId } : {}),
    ...(filter.query ? { person: { displayName: { contains: filter.query, mode: 'insensitive' } } } : {}) };
}

export function peopleCursor(scope: EventScope, db: PrismaTransactionClient,
  input: { filter: PeopleFilter; cursor: string }) {
  return db.eventMembership.findFirst({ where: { AND: [peopleWhere(scope, input.filter), { personId: input.cursor }] },
    select: { personId: true } });
}

export function countWorkspacePeople(scope: EventScope, db: PrismaTransactionClient, filter: PeopleFilter) {
  return db.eventMembership.count({ where: peopleWhere(scope, filter) });
}

export function workspacePeoplePage(scope: EventScope, db: PrismaTransactionClient,
  input: { filter: PeopleFilter; cursor?: string; limit: number }) {
  return db.eventMembership.findMany({ where: peopleWhere(scope, input.filter), select: memberProfile,
    orderBy: [{ person: { displayName: 'asc' } }, { personId: 'asc' }], take: input.limit + 1,
    ...(input.cursor ? { cursor: { eventId_personId: { eventId: scope.eventId, personId: input.cursor } }, skip: 1 } : {}) });
}

export function searchWorkspacePeople(scope: EventScope, db: PrismaTransactionClient,
  input: { request: SearchRequest; personId: string; stationIds?: readonly string[] }) {
  return db.eventMembership.findMany({ where: { eventId: scope.eventId,
    person: { displayName: { contains: input.request.query, mode: 'insensitive' },
      ...(input.stationIds ? { OR: [{ id: input.personId }, { shiftAssignments: { some: {
        eventId: scope.eventId, stationId: { in: [...input.stationIds] } } } }] } : {}) } },
    select: { ...memberReference, person: { select: { displayName: true, shiftAssignments: {
      where: { eventId: scope.eventId, ...(input.stationIds ? { stationId: { in: [...input.stationIds] } } : {}) },
      select: { id: true }, orderBy: { id: 'asc' }, take: 1 } } } },
    orderBy: [{ person: { displayName: 'asc' } }, { personId: 'asc' }], take: input.request.limit });
}
