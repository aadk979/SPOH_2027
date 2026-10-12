import type { EntityRef, RecordRow, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { entityLink, entityProjection, field } from '../../../platform/workspace/sourceRead.js';
import type { WorkspaceDay, WorkspaceShift } from '../data/workspaceRepo.js';

export function dayProjection(context: ReadContext, ref: EntityRef, row: WorkspaceDay) {
  return entityProjection(context, ref, { title: row.label, fields: [field('Date', row.date.toISOString().slice(0, 10), 'date'),
    field('Public day', row.isPublicDay, 'boolean'), field('Tour day', row.isTourDay, 'boolean')] });
}

export function shiftProjection(context: ReadContext, ref: EntityRef, row: WorkspaceShift) {
  return entityProjection(context, ref, { title: row.template.label,
    fields: [field('Code', row.template.code), field('Starts', row.startsAt.toISOString(), 'instant'),
      field('Ends', row.endsAt.toISOString(), 'instant'), field('Overridden', row.overridden, 'boolean')],
    related: [entityLink('Event day', { kind: 'event-day', id: row.eventDayId })] });
}

export function dayRecord(row: WorkspaceDay): RecordRow {
  return { id: row.id, title: row.label.slice(0, 240), recordedAt: null, fields: [field('Date', row.date.toISOString().slice(0, 10), 'date')],
    destination: { kind: 'event-day', id: row.id }, related: [] };
}

export async function structureActions(context: ReadContext): Promise<WorkspaceLink[]> {
  if (!(await context.canRead({ action: 'Structure.Read', resource: { type: 'Event', id: context.scope.eventId } }))) return [];
  return [{ label: 'Days and shift configuration', destination: { type: 'action', path: '/admin/days' } }];
}
