import type { RecordsFilter, SearchRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const dayFields = { id: true, date: true, label: true, isPublicDay: true, isTourDay: true } as const;
const shiftFields = { id: true, eventDayId: true, startsAt: true, endsAt: true, overridden: true,
  template: { select: { code: true, label: true } }, eventDay: { select: { date: true, label: true } } } as const;
export type WorkspaceDay = Prisma.EventDayGetPayload<{ select: typeof dayFields }>;
export type WorkspaceShift = Prisma.ShiftGetPayload<{ select: typeof shiftFields }>;
export interface OwnStructure { personId: string; membershipId: string }
export interface StructureRelation { assignmentId: string; personId: string; stationId: string }

function ownAssignments(scope: EventScope, own: OwnStructure) {
  return { eventId: scope.eventId, volunteerId: own.personId, membershipId: own.membershipId };
}

export function workspaceDay(scope: EventScope, db: PrismaTransactionClient,
  input: { id: string; own?: OwnStructure; via?: StructureRelation }) {
  return db.eventDay.findFirst({ where: { eventId: scope.eventId, id: input.id,
    ...(input.own ? { shiftAssignments: { some: ownAssignments(scope, input.own) } } : {}),
    ...(input.via ? { shiftAssignments: { some: { eventId: scope.eventId, id: input.via.assignmentId,
      volunteerId: input.via.personId, stationId: input.via.stationId } } } : {}) }, select: dayFields });
}

export function workspaceShift(scope: EventScope, db: PrismaTransactionClient,
  input: { id: string; own?: OwnStructure; via?: StructureRelation }) {
  return db.shift.findFirst({ where: { eventId: scope.eventId, id: input.id,
    ...(input.own ? { assignments: { some: ownAssignments(scope, input.own) } } : {}),
    ...(input.via ? { assignments: { some: { eventId: scope.eventId, id: input.via.assignmentId,
      volunteerId: input.via.personId, stationId: input.via.stationId } } } : {}) }, select: shiftFields });
}

export function structureAssignmentProof(scope: EventScope, db: PrismaTransactionClient, id: string) {
  return db.shiftAssignment.findFirst({ where: { eventId: scope.eventId, id },
    select: { id: true, volunteerId: true, stationId: true, eventDayId: true, shiftId: true } });
}

export function workspaceDayShifts(scope: EventScope, db: PrismaTransactionClient,
  input: { eventDayId: string; own?: OwnStructure }) {
  return db.shift.findMany({ where: { eventId: scope.eventId, eventDayId: input.eventDayId,
    ...(input.own ? { assignments: { some: ownAssignments(scope, input.own) } } : {}) }, select: shiftFields,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: 90 });
}

type DaysFilter = Extract<RecordsFilter, { kind: 'days' }>;
function daysWhere(scope: EventScope, input: { filter: DaysFilter; own?: OwnStructure }): Prisma.EventDayWhereInput {
  return { eventId: scope.eventId, ...(input.filter.date ? { date: new Date(`${input.filter.date}T00:00:00.000Z`) } : {}),
    ...(input.filter.eventDayId ? { id: input.filter.eventDayId } : {}),
    ...(input.own ? { shiftAssignments: { some: ownAssignments(scope, input.own) } } : {}) };
}

export function workspaceDaysCursor(scope: EventScope, db: PrismaTransactionClient,
  input: { filter: DaysFilter; cursor: string; own?: OwnStructure }) {
  return db.eventDay.findFirst({ where: { AND: [daysWhere(scope, input), { id: input.cursor }] }, select: { id: true } });
}

export function countWorkspaceDays(scope: EventScope, db: PrismaTransactionClient,
  input: { filter: DaysFilter; own?: OwnStructure }) {
  return db.eventDay.count({ where: daysWhere(scope, input) });
}

export function workspaceDaysPage(scope: EventScope, db: PrismaTransactionClient,
  input: { filter: DaysFilter; limit: number; cursor?: string; own?: OwnStructure }) {
  return db.eventDay.findMany({ where: daysWhere(scope, input), select: dayFields,
    orderBy: [{ date: 'asc' }, { id: 'asc' }], take: input.limit + 1,
    ...(input.cursor ? { cursor: { eventId_id: { eventId: scope.eventId, id: input.cursor } }, skip: 1 } : {}) });
}

export function searchWorkspaceDays(scope: EventScope, db: PrismaTransactionClient,
  input: { request: SearchRequest; own?: OwnStructure }) {
  return db.eventDay.findMany({ where: { eventId: scope.eventId,
    label: { contains: input.request.query, mode: 'insensitive' },
    ...(input.own ? { shiftAssignments: { some: ownAssignments(scope, input.own) } } : {}) }, select: dayFields,
    orderBy: [{ date: 'asc' }, { id: 'asc' }], take: input.request.limit });
}

export function searchWorkspaceShifts(scope: EventScope, db: PrismaTransactionClient,
  input: { request: SearchRequest; own?: OwnStructure }) {
  return db.shift.findMany({ where: { eventId: scope.eventId, template: { OR: [
    { code: { contains: input.request.query, mode: 'insensitive' } },
    { label: { contains: input.request.query, mode: 'insensitive' } },
  ] }, ...(input.own ? { assignments: { some: ownAssignments(scope, input.own) } } : {}) }, select: shiftFields,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: input.request.limit });
}
