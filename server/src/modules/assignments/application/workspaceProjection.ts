import type { EntityRef, RecordRow, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { entityLink, entityProjection, field } from '../../../platform/workspace/sourceRead.js';
import type { WorkspaceAssignment } from '../data/workspaceRepo.js';

export function assignmentRelated(row: WorkspaceAssignment): WorkspaceLink[] {
  const via = { kind: 'assignment' as const, assignmentId: row.id };
  return [entityLink('Station', { kind: 'station', id: row.stationId }), entityLink('Event day', { kind: 'event-day', id: row.eventDayId, via }),
    entityLink('Shift', { kind: 'shift', id: row.shiftId, via }), entityLink('Person', { kind: 'person', id: row.volunteerId,
      via: { kind: 'assignment', assignmentId: row.id } })];
}

export function assignmentFields(row: WorkspaceAssignment) {
  return [field('Role', row.roleLabel), field('Station', row.station.name), field('Person', row.volunteer.displayName),
    field('Date', row.eventDay.date.toISOString().slice(0, 10), 'date'), field('Shift', row.shift.template.label),
    field('Starts', row.shift.startsAt.toISOString(), 'instant'), field('Ends', row.shift.endsAt.toISOString(), 'instant'),
    field('Checked in', row.checkedInAt?.toISOString() ?? null, 'instant'), field('Checked out', row.checkedOutAt?.toISOString() ?? null, 'instant')];
}

export function assignmentProjection(context: ReadContext, ref: EntityRef, row: WorkspaceAssignment) {
  return entityProjection(context, ref, { title: `${row.volunteer.displayName} · ${row.station.name}`,
    fields: assignmentFields(row), related: assignmentRelated(row) });
}

export function assignmentRecord(row: WorkspaceAssignment): RecordRow {
  return { id: row.id, title: `${row.volunteer.displayName} · ${row.station.name}`.slice(0, 240),
    recordedAt: row.checkedInAt?.toISOString() ?? null, fields: assignmentFields(row),
    destination: { kind: 'assignment', id: row.id }, related: assignmentRelated(row) };
}
