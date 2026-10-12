import type { EntityRef, RecordsRequest, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { readableStationIds } from '../../../platform/access/readStations.js';
import { cursorAnchor, readableCollectionStations, recordsProjection, requireRead, requireSelfRead,
  type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { assignmentCursor, countWorkspaceAssignments, searchWorkspaceAssignments,
  workspaceAssignment, workspaceAssignmentPage, workspaceAssignmentProof } from '../data/workspaceRepo.js';
import { assignmentProjection, assignmentRecord } from './workspaceProjection.js';
import { readCoverage } from './workspaceCoverage.js';
import { observedTime } from '../../../platform/workspace/observation.js';

async function assignmentActions(context: ReadContext, row: { id: string; volunteerId: string }): Promise<WorkspaceLink[]> {
  const links: WorkspaceLink[] = [];
  if (row.volunteerId === context.personId) {
    links.push({ label: 'My shift', destination: { type: 'action', path: '/shift' } });
    links.push({ label: 'My attendance', destination: { type: 'action', path: '/attendance' } });
    if (await context.canRead({ action: 'Swap.Request', resource: { type: 'ShiftAssignment', id: row.id } })) {
      links.push({ label: 'Request a swap', destination: { type: 'action', path: '/swaps' } });
    }
  }
  if (await context.canRead({ action: 'Roster.Edit', resource: { type: 'Event', id: context.scope.eventId } })) {
    links.push({ label: 'Repair assignment', destination: { type: 'action', path: '/admin/staffing' } });
  }
  return links;
}

async function readAssignment(context: ReadContext, ref: EntityRef) {
  if (ref.kind !== 'assignment') return null;
  const proof = await workspaceAssignmentProof(context.scope, context.db, ref.id);
  if (!proof) return null;
  const own = proof.volunteerId === context.personId;
  if (own) await requireSelfRead(context);
  else await requireRead(context, 'Roster.ReadStation', { type: 'Station', id: proof.stationId });
  const row = await workspaceAssignment(context.scope, context.db, { proof,
    ...(own ? { own: { personId: context.personId, membershipId: context.membershipId! } } : {}) });
  if (!row) return null;
  const result = assignmentProjection(context, ref, row);
  result.actions = await assignmentActions(context, row);
  return result;
}

async function assignmentVisibility(context: ReadContext, filter: Extract<RecordsRequest['filter'], { kind: 'assignments' }>) {
  if (filter.personId === context.personId) {
    await requireSelfRead(context);
    return { own: { personId: context.personId, membershipId: context.membershipId! } };
  }
  return { stationIds: await readableCollectionStations(context, 'Roster.ReadStation', filter.stationId) };
}

async function readAssignments(context: ReadContext, input: RecordsRequest) {
  if (input.filter.kind !== 'assignments') throw new ValidationError('Choose assignment records.');
  if (input.filter.coverageGap !== undefined) return readCoverage(context, input);
  const selection = { filter: input.filter, asOf: (await observedTime(context,
    input.filter.asOf ? { asOf: input.filter.asOf } : {})).lte,
    ...await assignmentVisibility(context, input.filter) };
  await cursorAnchor(input.cursor, (cursor) => assignmentCursor(context.scope, context.db, { ...selection, cursor }));
  const count = await countWorkspaceAssignments(context.scope, context.db, selection);
  const page = await workspaceAssignmentPage(context.scope, context.db, { ...selection, limit: input.limit,
    ...(input.cursor ? { cursor: input.cursor } : {}) });
  const rows = page.slice(0, input.limit);
  return recordsProjection(context, input, { data: rows.map(assignmentRecord), count,
    aggregate: { value: count, unit: 'assignments' }, nextCursor: page.length > input.limit ? rows.at(-1)!.id : null });
}

export const assignmentWorkspaceSource: WorkspaceSource = {
  entity: readAssignment, records: readAssignments,
  async search(context, request) {
    await requireSelfRead(context);
    const stationIds = await readableStationIds(context, 'Roster.ReadStation');
    const visibility = { stationIds, own: { personId: context.personId, membershipId: context.membershipId! } };
    const rows = await searchWorkspaceAssignments(context.scope, context.db, { request, ...visibility });
    return rows.map((row) => ({ title: `${row.volunteer.displayName} · ${row.station.name}`.slice(0, 240),
      detail: row.roleLabel.slice(0, 300), destination: { kind: 'assignment' as const, id: row.id } }));
  },
};
