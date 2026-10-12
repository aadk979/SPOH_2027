import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordRow, RecordsRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { entityProjection, field, recordsProjection, requireRead } from '../../../platform/workspace/sourceRead.js';
import { captureStations } from '../../../platform/workspace/captureRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, stationRelated, importRelated } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { footfallStation, footfallWorkspacePage, footfallWorkspaceRow } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof footfallWorkspaceRow>>>;
const fields = (row: Row) => [field('Room entries', row.quantity, 'number'), field('Source', row.source),
  field('Recorded at', row.recordedAt.toISOString(), 'instant'), field('Practice', row.rehearsal, 'boolean'),
  field('Voided', row.voided, 'boolean'), field('Paper block start', row.timeBlockStart?.toISOString() ?? null, 'instant')];
async function related(context: ReadContext, row: Row) {
  return [...await stationRelated(context, row.stationId), ...await actorRelated(context, row.recordedById), ...await importRelated(context, row.importBatch)];
}
async function entity(context: ReadContext, ref: EntityRef) {
  const metadata = await footfallStation(context, ref.id);
  if (!metadata) return null;
  await requireRead(context, 'Dashboard.ReadStation', { type: 'Station', id: metadata.stationId });
  const row = await footfallWorkspaceRow(context, ref.id);
  if (!row) return null;
  const result = entityProjection(context, ref, { title: `${row.quantity} room entries`, fields: fields(row), related: await related(context, row) });
  if (await context.canRead({ action: 'Record.Void', resource: { type: 'FootfallTick', id: row.id } }))
    result.actions.push({ label: 'Correct this footfall record', destination: { type: 'action', path: '/admin/corrections', query: { id: row.id, stationId: row.stationId } } });
  return result;
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'footfall') throw new ValidationError('Choose footfall records.');
  const stationIds = await captureStations(context, filter);
  const result = await footfallWorkspacePage(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, stationId: { in: stationIds }, recordedAt: await observedTime(context, filter),
      ...capturePool(filter), voided: filter.voided ?? false, ...(filter.personId ? { recordedById: filter.personId } : {}),
      ...(filter.source ? { source: filter.source } : {}), ...(filter.importBatchId ? { importBatchId: filter.importBatchId } : {}),
      ...(filter.countedStationsOnly === undefined ? {} : { station: { eventId: context.scope.eventId,
        ...(filter.countedStationsOnly ? { active: true } : {}), type: { countsEntry: filter.countedStationsOnly } } }) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data: RecordRow[] = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: `${row.quantity} room entries`,
    recordedAt: row.recordedAt.toISOString(), fields: fields(row), destination: { kind: 'footfall', id: row.id }, related: await related(context, row) }));
  return recordsProjection(context, request, { data, count: result.count, aggregate: { value: result.quantity, unit: 'roomEntries' }, nextCursor: page.nextCursor });
}
export const footfallWorkspaceSource: WorkspaceSource = { entity, records };
