import type { EntityRef, RecordsRequest, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { readableStationIds } from '../../../platform/access/readStations.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { cursorAnchor, requireEventRead, requireRead, requireSelfRead, recordsProjection,
  type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { ownPersonReference, personProfile, personViaAssignment, personViaAssignmentProof,
  countWorkspacePeople, peopleCursor, searchWorkspacePeople, workspacePeoplePage } from '../data/workspaceRepo.js';
import { fullPerson, limitedPerson, workspacePersonRow } from './workspaceProjection.js';

async function relatedPersonRecords(context: ReadContext, personId: string): Promise<WorkspaceLink[]> {
  const own = personId === context.personId;
  const roster = await readableStationIds(context, 'Roster.ReadStation');
  const links: WorkspaceLink[] = own || roster.length > 0 ? [{ label: 'Assignments',
    destination: { type: 'records', filter: { kind: 'assignments', personId } } }] : [];
  if (await context.canRead({ action: 'Dashboard.ReadEvent', resource: { type: 'Event', id: context.scope.eventId } })) {
    for (const kind of ['registrations', 'footfall', 'stamps', 'redemptions'] as const) {
      links.push({ label: kind, destination: { type: 'records', filter: { kind, personId } } });
    }
  }
  if (await context.canRead({ action: 'Incident.Read', resource: { type: 'Event', id: context.scope.eventId } })) {
    links.push({ label: 'Raised incidents', destination: { type: 'records', filter: { kind: 'incidents', personId } } });
  }
  return links;
}

async function requirePersonAssignment(context: ReadContext, ref: EntityRef) {
  if (!ref.via) return;
  const proof = await personViaAssignmentProof(context.scope, context.db,
    { assignmentId: ref.via.assignmentId, personId: ref.id });
  if (!proof) throw new NotFoundError('Person assignment');
}

async function readLimitedPerson(context: ReadContext, ref: EntityRef) {
  if (ref.id === context.personId) {
    await requireSelfRead(context);
    await requirePersonAssignment(context, ref);
    const member = await ownPersonReference(context.scope, context.db, { personId: ref.id, membershipId: context.membershipId! });
    return member ? limitedPerson(context, ref, member) : null;
  }
  if (!ref.via) throw new ForbiddenError('Open this person through an authorized assignment.');
  const input = { assignmentId: ref.via.assignmentId, personId: ref.id };
  const proof = await personViaAssignmentProof(context.scope, context.db, input);
  if (!proof) throw new NotFoundError('Person assignment');
  await requireRead(context, 'Roster.ReadStation', { type: 'Station', id: proof.stationId });
  const member = await personViaAssignment(context.scope, context.db, { ...input, stationId: proof.stationId });
  return member ? limitedPerson(context, ref, member) : null;
}

async function readPerson(context: ReadContext, ref: EntityRef) {
  if (ref.kind !== 'person') return null;
  const full = await context.canRead({ action: 'People.Read', resource: { type: 'Event', id: context.scope.eventId } });
  if (full) await requirePersonAssignment(context, ref);
  const member = full ? await personProfile(context.scope, context.db, ref.id) : null;
  const result = full ? (member ? fullPerson(context, ref, member) : null) : await readLimitedPerson(context, ref);
  if (!result) return null;
  result.related.push(...await relatedPersonRecords(context, ref.id));
  result.facets.push({ name: 'Full event profile', availability: full ? 'available' : 'denied' });
  if (ref.id === context.personId) result.actions.push({ label: 'My attendance', destination: { type: 'action', path: '/attendance' } });
  return result;
}

async function readPeopleRecords(context: ReadContext, input: RecordsRequest) {
  if (input.filter.kind !== 'people') throw new ValidationError('Choose people records.');
  await requireEventRead(context, 'People.Read');
  const filter = input.filter;
  await cursorAnchor(input.cursor, (cursor) => peopleCursor(context.scope, context.db, { filter, cursor }));
  const count = await countWorkspacePeople(context.scope, context.db, filter);
  const page = await workspacePeoplePage(context.scope, context.db, { filter, limit: input.limit,
    ...(input.cursor ? { cursor: input.cursor } : {}) });
  const rows = page.slice(0, input.limit);
  return recordsProjection(context, input, { data: rows.map(workspacePersonRow), count,
    aggregate: { value: count, unit: 'people' }, nextCursor: page.length > input.limit ? rows.at(-1)!.personId : null });
}

export const peopleWorkspaceSource: WorkspaceSource = {
  entity: readPerson, records: readPeopleRecords,
  async search(context, request) {
    const full = await context.canRead({ action: 'People.Read', resource: { type: 'Event', id: context.scope.eventId } });
    if (!full) await requireSelfRead(context);
    const stationIds = full ? undefined : await readableStationIds(context, 'Roster.ReadStation');
    const rows = await searchWorkspacePeople(context.scope, context.db, { request, personId: context.personId,
      ...(stationIds ? { stationIds } : {}) });
    return rows.map((row) => ({ title: row.person.displayName.slice(0, 240), detail: 'Event person',
      destination: { kind: 'person' as const, id: row.personId,
        ...(!full && row.personId !== context.personId && row.person.shiftAssignments[0]
          ? { via: { kind: 'assignment' as const, assignmentId: row.person.shiftAssignments[0].id } } : {}) } }));
  },
};
