import type { EntityRef, RecordsRequest, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { readableStationIds } from '../../../platform/access/readStations.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { cursorAnchor, entityLink, recordsProjection, requireRead, requireSelfRead,
  type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { countWorkspaceDays, searchWorkspaceDays, searchWorkspaceShifts, workspaceDay,
  structureAssignmentProof, workspaceDayShifts, workspaceDaysCursor, workspaceDaysPage, workspaceShift,
  type OwnStructure, type StructureRelation } from '../data/workspaceRepo.js';
import { dayProjection, dayRecord, shiftProjection, structureActions } from './workspaceProjection.js';

async function structureVisibility(context: ReadContext): Promise<{ own?: OwnStructure }> {
  if (await context.canRead({ action: 'Structure.Read', resource: { type: 'Event', id: context.scope.eventId } })) return {};
  await requireSelfRead(context);
  return { own: { personId: context.personId, membershipId: context.membershipId! } };
}

async function structureEntityVisibility(context: ReadContext, ref: EntityRef): Promise<{ own?: OwnStructure; via?: StructureRelation }> {
  if (!ref.via) return structureVisibility(context);
  const proof = await structureAssignmentProof(context.scope, context.db, ref.via.assignmentId);
  if (!proof || (ref.kind === 'event-day' ? proof.eventDayId : proof.shiftId) !== ref.id) throw new NotFoundError('Assignment context');
  if (await context.canRead({ action: 'Structure.Read', resource: { type: 'Event', id: context.scope.eventId } })) return {};
  if (proof.volunteerId === context.personId) {
    await requireSelfRead(context);
    return { own: { personId: context.personId, membershipId: context.membershipId! } };
  }
  await requireRead(context, 'Roster.ReadStation', { type: 'Station', id: proof.stationId });
  return { via: { assignmentId: proof.id, personId: proof.volunteerId, stationId: proof.stationId } };
}

async function dayRelated(context: ReadContext, day: { id: string; date: Date }, own?: { personId: string; membershipId: string }) {
  const shifts = await workspaceDayShifts(context.scope, context.db, { eventDayId: day.id, ...(own ? { own } : {}) });
  const links: WorkspaceLink[] = shifts.map((shift) => entityLink(shift.template.label.slice(0, 160), { kind: 'shift', id: shift.id }));
  if (await context.canRead({ action: 'Dashboard.ReadEvent', resource: { type: 'Event', id: context.scope.eventId } })) {
    const date = day.date.toISOString().slice(0, 10);
    for (const kind of ['registrations', 'footfall', 'cards', 'fallback'] as const) {
      links.push({ label: kind, destination: { type: 'records', filter: { kind, date } } });
    }
  }
  if (own || (await readableStationIds(context, 'Roster.ReadStation')).length > 0) {
    links.push({ label: own ? 'My assignments' : 'Assignments', destination: { type: 'records',
      filter: { kind: 'assignments', eventDayId: day.id, ...(own ? { personId: context.personId } : {}) } } });
  }
  return links;
}

async function readDay(context: ReadContext, ref: EntityRef) {
  const visibility = await structureEntityVisibility(context, ref);
  const row = await workspaceDay(context.scope, context.db, { id: ref.id, ...visibility });
  if (!row) return null;
  const result = dayProjection(context, ref, row);
  result.related = visibility.via ? [entityLink('Proved assignment', { kind: 'assignment', id: visibility.via.assignmentId })]
    : await dayRelated(context, row, visibility.own);
  result.actions = await structureActions(context);
  if (visibility.own) result.actions.push({ label: 'My attendance', destination: { type: 'action', path: '/attendance' } });
  return result;
}

async function readShift(context: ReadContext, ref: EntityRef) {
  const visibility = await structureEntityVisibility(context, ref);
  const shift = await workspaceShift(context.scope, context.db, { id: ref.id, ...visibility });
  if (!shift) return null;
  const result = shiftProjection(context, ref, shift);
  if (ref.via) result.related = [entityLink('Event day', { kind: 'event-day', id: shift.eventDayId, via: ref.via })];
  if (visibility.own || (await readableStationIds(context, 'Roster.ReadStation')).length > 0) {
    result.related.push({ label: visibility.own ? 'My assignment' : 'Shift roster', destination: { type: 'records',
      filter: { kind: 'assignments', shiftId: shift.id, ...(visibility.own ? { personId: context.personId } : {}) } } });
  }
  result.actions = await structureActions(context);
  return result;
}

async function readStructure(context: ReadContext, ref: EntityRef) {
  if (ref.kind === 'event-day') return readDay(context, ref);
  if (ref.kind === 'shift') return readShift(context, ref);
  return null;
}

async function readDays(context: ReadContext, input: RecordsRequest) {
  if (input.filter.kind !== 'days') throw new ValidationError('Choose day records.');
  const visibility = await structureVisibility(context);
  const options = { filter: input.filter, ...visibility };
  await cursorAnchor(input.cursor, (cursor) => workspaceDaysCursor(context.scope, context.db, { ...options, cursor }));
  const count = await countWorkspaceDays(context.scope, context.db, options);
  const page = await workspaceDaysPage(context.scope, context.db, { ...options, limit: input.limit,
    ...(input.cursor ? { cursor: input.cursor } : {}) });
  const rows = page.slice(0, input.limit);
  return recordsProjection(context, input, { data: rows.map(dayRecord), count, aggregate: { value: count, unit: 'days' },
    nextCursor: page.length > input.limit ? rows.at(-1)!.id : null });
}

export const structureWorkspaceSource: WorkspaceSource = {
  entity: readStructure, records: readDays,
  async search(context, request) {
    const visibility = await structureVisibility(context);
    const days = await searchWorkspaceDays(context.scope, context.db, { request, ...visibility });
    const shifts = await searchWorkspaceShifts(context.scope, context.db, { request, ...visibility });
    return [...days.map((day) => ({ title: day.label.slice(0, 240), detail: day.date.toISOString().slice(0, 10),
      destination: { kind: 'event-day' as const, id: day.id } })), ...shifts.map((shift) => ({ title: shift.template.label.slice(0, 240),
      detail: shift.startsAt.toISOString(), destination: { kind: 'shift' as const, id: shift.id } }))].slice(0, request.limit);
  },
};
