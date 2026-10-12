import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordRow, RecordsFilter, RecordsRequest, SearchRequest, SearchResponse } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, auditRelated, stationRelated } from '../../../platform/workspace/related.js';
import { entityProjection, field, recordsProjection, requireEventRead, requireRead,
  type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { incidentWorkspaceBody, incidentWorkspacePage, incidentWorkspaceSearch } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof incidentWorkspaceBody>>>;
function fields(row: Pick<Row, 'type' | 'severity' | 'status' | 'rehearsal' | 'occurredAt' | 'reportedAt'>) {
  return [field('Type', row.type), field('Severity', row.severity), field('Status', row.status),
    field('Practice', row.rehearsal, 'boolean'), field('Occurred at', row.occurredAt.toISOString(), 'instant'),
    field('Reported at', row.reportedAt.toISOString(), 'instant')];
}
async function related(context: ReadContext, row: { stationId: string | null; reportedById: string }) {
  return [...await stationRelated(context, row.stationId), ...await actorRelated(context, row.reportedById)];
}
async function entity(context: ReadContext, ref: EntityRef) {
  await requireRead(context, 'Incident.Read', { type: 'Incident', id: ref.id });
  const row = await incidentWorkspaceBody(context, ref.id);
  if (!row) return null;
  const notes = row.followUps.flatMap((note) => [field('Follow-up at', note.createdAt.toISOString(), 'instant'), field('Follow-up', note.note)]);
  const result = entityProjection(context, ref, { title: `${row.severity} ${row.type} incident`,
    fields: [...fields(row), field('Description', row.description), field('Location', row.locationNote),
      field('Follow-ups', row._count.followUps, 'number'), ...notes],
    related: [...await related(context, row), ...await auditRelated(context, { kind: 'incident', type: 'Incident', id: row.id })] });
  if (row._count.followUps > row.followUps.length) result.facets.push({ name: 'Earlier follow-ups', availability: 'unavailable',
    explanation: 'This home shows the latest ten follow-ups. Open the incident screen for its full history.' });
  if (await context.canRead({ action: 'Incident.Update', resource: { type: 'Incident', id: row.id } }))
    result.actions.push({ label: 'Update this incident', destination: { type: 'action', path: '/safety/incidents', query: { id: row.id } } });
  return result;
}
async function record(context: ReadContext, row: Awaited<ReturnType<typeof incidentWorkspacePage>>['rows'][number]): Promise<RecordRow> {
  const readable = await context.canRead({ action: 'Incident.Read', resource: { type: 'Incident', id: row.id } });
  return { id: row.id, title: `${row.severity} ${row.type}`, recordedAt: row.reportedAt.toISOString(), fields: fields(row),
    destination: readable ? { kind: 'incident', id: row.id } : null,
    related: readable ? await related(context, row) : [] };
}
function statusPredicate(filter: Extract<RecordsFilter, { kind: 'incidents' }>) {
  if (filter.status) return { status: filter.status };
  if (filter.open === undefined) return {};
  return filter.open ? { status: { in: ['OPEN' as const, 'ACKNOWLEDGED' as const] } } : { status: 'RESOLVED' as const };
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'incidents') throw new ValidationError('Choose incident records.');
  await requireEventRead(context, 'Incident.Read');
  const result = await incidentWorkspacePage(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, reportedAt: await observedTime(context, filter), ...capturePool(filter),
      ...(filter.stationId ? { stationId: filter.stationId } : {}), ...(filter.personId ? { reportedById: filter.personId } : {}),
      ...statusPredicate(filter),
      ...(filter.severity ? { severity: filter.severity } : {}), ...(filter.incidentType ? { type: filter.incidentType } : {}) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data = await mapReadRows(page.rows, (row) => record(context, row));
  return recordsProjection(context, request, { data, count: result.count,
    aggregate: { value: result.count, unit: 'incidents' }, nextCursor: page.nextCursor });
}
async function search(context: ReadContext, input: SearchRequest): Promise<SearchResponse['data']> {
  if (!await context.canRead({ action: 'Incident.Read', resource: { type: 'Event', id: context.scope.eventId } })) return [];
  const result: SearchResponse['data'] = [];
  for (const row of await incidentWorkspaceSearch(context, input)) {
    if (await context.canRead({ action: 'Incident.Read', resource: { type: 'Incident', id: row.id } }))
      result.push({ title: `${row.severity} ${row.type}`, detail: row.status, destination: { kind: 'incident', id: row.id } });
  }
  return result;
}
export const incidentWorkspaceSource: WorkspaceSource = { entity, records, search };
