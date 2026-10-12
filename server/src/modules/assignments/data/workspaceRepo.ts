import type { RecordsFilter, SearchRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const proofFields = { id: true, volunteerId: true, membershipId: true, stationId: true, shiftId: true, eventDayId: true } as const;
const assignmentFields = { ...proofFields, roleLabel: true, checkedInAt: true, checkedOutAt: true,
  volunteer: { select: { displayName: true } }, station: { select: { name: true } },
  eventDay: { select: { date: true, label: true } },
  shift: { select: { startsAt: true, endsAt: true, template: { select: { code: true, label: true } } } } } as const;
export type AssignmentProof = Prisma.ShiftAssignmentGetPayload<{ select: typeof proofFields }>;
export type WorkspaceAssignment = Prisma.ShiftAssignmentGetPayload<{ select: typeof assignmentFields }>;
type AssignmentFilter = Extract<RecordsFilter, { kind: 'assignments' }>;
export interface AssignmentVisibility { stationIds?: readonly string[]; own?: { personId: string; membershipId: string } }

export function workspaceAssignmentProof(scope: EventScope, db: PrismaTransactionClient, id: string) {
  return db.shiftAssignment.findFirst({ where: { eventId: scope.eventId, id }, select: proofFields });
}

/** The final named read retains the relation used to decide authority. */
export function workspaceAssignment(scope: EventScope, db: PrismaTransactionClient,
  input: { proof: AssignmentProof; own?: { personId: string; membershipId: string } }) {
  return db.shiftAssignment.findFirst({ where: { eventId: scope.eventId, ...input.proof,
    ...(input.own ? { volunteerId: input.own.personId, membershipId: input.own.membershipId } : {}) }, select: assignmentFields });
}

function runningFilter(running: boolean | undefined, asOf: Date): Prisma.ShiftWhereInput {
  if (running === undefined) return {};
  return running ? { startsAt: { lte: asOf }, endsAt: { gt: asOf } }
    : { OR: [{ startsAt: { gt: asOf } }, { endsAt: { lte: asOf } }] };
}

function checkInFilter(checked: boolean | undefined, asOf: Date): Prisma.ShiftAssignmentWhereInput {
  if (checked === undefined) return {};
  return checked ? { checkedInAt: { lte: asOf } } : { OR: [{ checkedInAt: null }, { checkedInAt: { gt: asOf } }] };
}

function checkOutFilter(checked: boolean | undefined, asOf: Date): Prisma.ShiftAssignmentWhereInput {
  if (checked === undefined) return {};
  return checked ? { checkedOutAt: { lte: asOf } } : { OR: [{ checkedOutAt: null }, { checkedOutAt: { gt: asOf } }] };
}

export interface AssignmentSelection extends AssignmentVisibility { filter: AssignmentFilter; asOf: Date }
function assignmentsWhere(scope: EventScope, input: AssignmentSelection): Prisma.ShiftAssignmentWhereInput {
  const { filter, asOf } = input;
  return { eventId: scope.eventId,
    ...(input.stationIds ? { stationId: { in: [...input.stationIds] } } : {}),
    ...(input.own ? { volunteerId: input.own.personId, membershipId: input.own.membershipId } : {}),
    ...(filter.personId ? { volunteerId: filter.personId } : {}),
    ...(filter.stationId ? { stationId: filter.stationId } : {}),
    ...(filter.shiftId ? { shiftId: filter.shiftId } : {}),
    ...(filter.eventDayId ? { eventDayId: filter.eventDayId } : {}),
    ...(filter.date ? { eventDay: { date: new Date(`${filter.date}T00:00:00.000Z`) } } : {}),
    shift: { eventId: scope.eventId, ...runningFilter(filter.running, asOf) },
    AND: [checkInFilter(filter.checkedIn, asOf), checkOutFilter(filter.checkedOut, asOf)] };
}

export function assignmentCursor(scope: EventScope, db: PrismaTransactionClient,
  input: AssignmentSelection & { cursor: string }) {
  return db.shiftAssignment.findFirst({ where: { ...assignmentsWhere(scope, input), id: input.cursor }, select: { id: true } });
}

export function countWorkspaceAssignments(scope: EventScope, db: PrismaTransactionClient, input: AssignmentSelection) {
  return db.shiftAssignment.count({ where: assignmentsWhere(scope, input) });
}

export function workspaceAssignmentPage(scope: EventScope, db: PrismaTransactionClient,
  input: AssignmentSelection & { limit: number; cursor?: string }) {
  return db.shiftAssignment.findMany({ where: assignmentsWhere(scope, input), select: assignmentFields,
    orderBy: [{ shift: { startsAt: 'asc' } }, { id: 'asc' }], take: input.limit + 1,
    ...(input.cursor ? { cursor: { eventId_id: { eventId: scope.eventId, id: input.cursor } }, skip: 1 } : {}) });
}

export function searchWorkspaceAssignments(scope: EventScope, db: PrismaTransactionClient,
  input: AssignmentVisibility & { request: SearchRequest }) {
  return db.shiftAssignment.findMany({ where: { eventId: scope.eventId,
    AND: [{ OR: [
      ...(input.stationIds ? [{ stationId: { in: [...input.stationIds] } }] : []),
      ...(input.own ? [{ volunteerId: input.own.personId, membershipId: input.own.membershipId }] : []),
    ] }],
    OR: [{ roleLabel: { contains: input.request.query, mode: 'insensitive' } },
      { volunteer: { displayName: { contains: input.request.query, mode: 'insensitive' } } }] }, select: assignmentFields,
    orderBy: [{ shift: { startsAt: 'asc' } }, { id: 'asc' }], take: input.request.limit });
}

export interface CoverageSelection { filter: AssignmentFilter; stationIds: readonly string[]; asOf: Date }
export function coverageStations(scope: EventScope, db: PrismaTransactionClient, input: CoverageSelection) {
  return db.station.findMany({ where: { eventId: scope.eventId, active: true, id: { in: [...input.stationIds] } },
    select: { id: true, name: true }, orderBy: { id: 'asc' } });
}

export function coverageShifts(scope: EventScope, db: PrismaTransactionClient, input: CoverageSelection) {
  return db.shift.findMany({ where: { eventId: scope.eventId, startsAt: { lte: input.asOf }, endsAt: { gt: input.asOf },
    ...(input.filter.shiftId ? { id: input.filter.shiftId } : {}),
    ...(input.filter.eventDayId ? { eventDayId: input.filter.eventDayId } : {}),
    ...(input.filter.date ? { eventDay: { date: new Date(`${input.filter.date}T00:00:00.000Z`) } } : {}) },
    select: { id: true, eventDayId: true, template: { select: { code: true, label: true } } }, orderBy: { id: 'asc' } });
}

export function coverageAssigned(scope: EventScope, db: PrismaTransactionClient, input: CoverageSelection) {
  return db.shiftAssignment.groupBy({ by: ['stationId', 'shiftId'], where: { eventId: scope.eventId,
    stationId: { in: [...input.stationIds] }, shift: { eventId: scope.eventId,
      startsAt: { lte: input.asOf }, endsAt: { gt: input.asOf } } }, _count: { id: true } });
}

export function coverageCheckedIn(scope: EventScope, db: PrismaTransactionClient, input: CoverageSelection) {
  return db.shiftAssignment.groupBy({ by: ['stationId', 'shiftId'], where: { eventId: scope.eventId,
    stationId: { in: [...input.stationIds] }, checkedInAt: { lte: input.asOf },
    OR: [{ checkedOutAt: null }, { checkedOutAt: { gt: input.asOf } }],
    shift: { eventId: scope.eventId, startsAt: { lte: input.asOf }, endsAt: { gt: input.asOf } } }, _count: { id: true } });
}
