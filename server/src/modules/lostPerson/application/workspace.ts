import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordRow, RecordsRequest, SearchRequest, SearchResponse, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, stationRelated } from '../../../platform/workspace/related.js';
import { entityProjection, field, recordsProjection, requireSelfRead, type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { activeWorkspaceDescription, lostPersonWorkspacePage, lostPersonWorkspaceRow,
  lostPersonWorkspaceSearch, ownWorkspaceAlertAck } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof lostPersonWorkspaceRow>>>;
function fields(row: Row) {
  return [field('Status', row.status), field('Practice', row.rehearsal, 'boolean'),
    field('Raised at', row.raisedAt.toISOString(), 'instant'), field('Resolved at', row.resolvedAt?.toISOString() ?? null, 'instant'),
    field('Last seen at', row.lastSeenAt?.toISOString() ?? null, 'instant')];
}
async function related(context: ReadContext, row: Row) {
  return [...await stationRelated(context, row.lastSeenStationId), ...await actorRelated(context, row.raisedById)];
}
async function activeFields(context: ReadContext, row: Row) {
  if (row.status !== 'ACTIVE') return null;
  const description = await activeWorkspaceDescription(context, row.id);
  return description ? [field('Approximate age', description.approxAge), field('Description', description.descriptionText),
    field('Clothing', description.clothingText), field('Reporter', description.raisedBy.displayName),
    field('Reporter contact', description.raisedBy.phone)] : null;
}
async function actions(context: ReadContext, row: Row) {
  const result: WorkspaceLink[] = [];
  if (row.status !== 'ACTIVE') return result;
  const ack = await ownWorkspaceAlertAck(context, { id: row.id, personId: context.personId });
  if (!ack && await context.canRead({ action: 'Alert.Ack', resource: { type: 'LostPersonAlert', id: row.id } }))
    result.push({ label: 'Open and acknowledge this alert', destination: { type: 'action', path: '/home', query: { id: row.id } } });
  if (await context.canRead({ action: 'LostPerson.Resolve', resource: { type: 'LostPersonAlert', id: row.id } }))
    result.push({ label: 'Open and resolve this alert', destination: { type: 'action', path: '/home', query: { id: row.id } } });
  return result;
}
async function entity(context: ReadContext, ref: EntityRef) {
  await requireSelfRead(context);
  const row = await lostPersonWorkspaceRow(context, ref.id);
  if (!row) return null;
  const description = await activeFields(context, row);
  const result = entityProjection(context, ref, { title: `Lost-person alert: ${row.status}`, fields: [...fields(row), ...(description ?? [])],
    related: await related(context, row), actions: description ? await actions(context, row) : [] });
  if (!description) result.facets.push({ name: 'Search descriptors', availability: 'unavailable',
    explanation: 'Descriptors and reporter contact are shown only for current searches. Practice searches are active only during rehearsal.' });
  return result;
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'lost-person') throw new ValidationError('Choose lost-person alert records.');
  await requireSelfRead(context);
  const result = await lostPersonWorkspacePage(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, raisedAt: await observedTime(context, filter), ...capturePool(filter),
      ...(filter.status ? { status: filter.status } : {}), ...(filter.stationId ? { lastSeenStationId: filter.stationId } : {}),
      ...(filter.personId ? { raisedById: filter.personId } : {}) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data: RecordRow[] = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: `Lost-person alert: ${row.status}`,
    recordedAt: row.raisedAt.toISOString(), fields: fields(row), destination: { kind: 'lost-person', id: row.id }, related: await related(context, row) }));
  return recordsProjection(context, request, { data, count: result.count,
    aggregate: { value: result.count, unit: 'alerts' }, nextCursor: page.nextCursor });
}
async function search(context: ReadContext, input: SearchRequest): Promise<SearchResponse['data']> {
  if (!context.membershipId || !await context.canRead({ action: 'Self.Read', resource: { type: 'Membership', id: context.membershipId } })) return [];
  return (await lostPersonWorkspaceSearch(context, input)).map((row) => ({ title: `Lost-person alert: ${row.status}`,
    detail: row.rehearsal ? 'Practice' : 'Event search', destination: { kind: 'lost-person', id: row.id } }));
}
export const lostPersonWorkspaceSource: WorkspaceSource = { entity, records, search };
