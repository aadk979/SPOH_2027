import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordRow, RecordsRequest, RecordsFilter } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { entityProjection, field, recordsProjection, requireRead } from '../../../platform/workspace/sourceRead.js';
import { captureStations } from '../../../platform/workspace/captureRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, cardRelated, stationRelated, importRelated, recordsLink } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { registrationStation, registrationWorkspacePage, registrationWorkspaceRow } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof registrationWorkspaceRow>>>;
const fields = (row: Row) => [field('Category', row.captureCategory.label), field('Category code', row.captureCategory.code),
  field('Source', row.source), field('Recorded at', row.recordedAt.toISOString(), 'instant'),
  field('Practice', row.rehearsal, 'boolean'), field('Voided', row.voided, 'boolean'), field('Void reason', row.voidedReason)];
async function related(context: ReadContext, row: Row) {
  return [...await stationRelated(context, row.stationId), ...await actorRelated(context, row.recordedById),
    ...await cardRelated(context, row.missionCardId), ...await importRelated(context, row.importBatch),
    ...(row.groupId ? [recordsLink('Group registrations', { kind: 'registrations', groupId: row.groupId, rehearsal: row.rehearsal })] : [])];
}
async function entity(context: ReadContext, ref: EntityRef) {
  const metadata = await registrationStation(context, ref.id);
  if (!metadata) return null;
  await requireRead(context, 'Dashboard.ReadStation', { type: 'Station', id: metadata.stationId });
  const row = await registrationWorkspaceRow(context, ref.id);
  if (!row) return null;
  const result = entityProjection(context, ref, { title: `Registration: ${row.captureCategory.label}`,
    fields: fields(row), related: await related(context, row) });
  if (await context.canRead({ action: 'Record.Void', resource: { type: 'Registration', id: row.id } }))
    result.actions.push({ label: 'Correct this registration', destination: { type: 'action', path: '/admin/corrections', query: { id: row.id, stationId: row.stationId } } });
  return result;
}
function registrationFilters(context: ReadContext, filter: Extract<RecordsFilter, { kind: 'registrations' }>) {
  return { ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.categoryCode ? { captureCategory: { eventId: context.scope.eventId, code: filter.categoryCode } } : {}),
    ...(filter.groupId ? { groupId: filter.groupId } : {}), ...(filter.importBatchId ? { importBatchId: filter.importBatchId } : {}),
    ...(filter.cardId ? { missionCardId: filter.cardId } : {}) };
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'registrations') throw new ValidationError('Choose registration records.');
  const stationIds = await captureStations(context, filter);
  const result = await registrationWorkspacePage(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, stationId: { in: stationIds }, recordedAt: await observedTime(context, filter),
      ...capturePool(filter), voided: filter.voided ?? false, ...(filter.personId ? { recordedById: filter.personId } : {}),
      ...(filter.source ? { source: filter.source } : {}), ...registrationFilters(context, filter) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data: RecordRow[] = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: row.captureCategory.label,
    recordedAt: row.recordedAt.toISOString(), fields: fields(row), destination: { kind: 'registration', id: row.id }, related: await related(context, row) }));
  return recordsProjection(context, request, { data, count: result.count, aggregate: { value: result.count, unit: 'registrations' }, nextCursor: page.nextCursor });
}
export const registrationWorkspaceSource: WorkspaceSource = { entity, records };
