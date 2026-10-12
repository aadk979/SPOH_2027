import type { EntityRef, RecordRow } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { entityLink, entityProjection, field } from '../../../platform/workspace/sourceRead.js';
import type { WorkspacePerson, WorkspacePersonReference } from '../data/workspaceRepo.js';

export function limitedPerson(context: ReadContext, ref: EntityRef, member: WorkspacePersonReference) {
  return entityProjection(context, ref, { title: member.person.displayName,
    fields: [field('Event membership', member.id)], related: ref.via
      ? [entityLink('Proved assignment', { kind: 'assignment', id: ref.via.assignmentId })] : [] });
}

export function fullPerson(context: ReadContext, ref: EntityRef, member: WorkspacePerson) {
  return entityProjection(context, ref, { title: member.person.displayName,
    fields: [field('Event membership', member.id), field('Role', member.role), field('Portfolio', member.portfolio),
      field('Standing', member.status), field('Email', member.person.email), field('Phone', member.person.phone)],
    related: member.reportsTo ? [entityLink(`Reports to ${member.reportsTo.person.displayName}`.slice(0, 160),
      { kind: 'person', id: member.reportsTo.personId })] : [],
    actions: [{ label: 'Event person profile', destination: { type: 'action', path: '/admin/users/person', query: { id: member.personId } } }] });
}

export function workspacePersonRow(member: WorkspacePerson): RecordRow {
  return { id: member.personId, title: member.person.displayName.slice(0, 240), recordedAt: null,
    destination: { kind: 'person', id: member.personId }, related: [],
    fields: [field('Role', member.role), field('Portfolio', member.portfolio), field('Standing', member.status)] };
}
