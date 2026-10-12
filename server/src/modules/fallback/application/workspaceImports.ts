import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordsRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { entityLink, entityProjection, field, recordsProjection, requireEventRead } from '../../../platform/workspace/sourceRead.js';
import { readableStationIds } from '../../../platform/access/readStations.js';
import { boundedPage, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, recordsLink } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { workspaceBatch, workspaceBatchMetadata, workspaceBatches, workspaceImportCaptureIds, workspaceImportEvent, workspaceWindowStation } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof workspaceBatch>>>;
const tables = { REGISTRATION: 'Registration', FOOTFALL: 'FootfallTick', ROSTER: 'Roster' } as const;
async function requireImportRead(context: ReadContext, input: { archived: boolean; targetTable?: string }) {
  if (input.archived || !input.targetTable || await context.canRead({ action: 'Audit.Read', resource: { type: 'Event', id: context.scope.eventId } }))
    return requireEventRead(context, 'Audit.Read');
  return requireEventRead(context, input.targetTable === 'Roster' ? 'Roster.Edit' : 'Fallback.Import');
}
const fields = (row: Row) => [field('Type', row.targetTable), field('Source', row.source), field('Rows inserted', row.rowCount, 'number'),
  field('Practice', row.rehearsal, 'boolean'), field('File', row.fileName), field('Notes', row.notes),
  field('Exact row ownership', row.provenanceVersion === 1, 'boolean'), field('Undone at', row.undoneAt?.toISOString() ?? null, 'instant')];
async function undoAllowed(context: ReadContext, row: Row) {
  if (row.provenanceVersion !== 1 || row.undoneAt || !['Registration', 'FootfallTick'].includes(row.targetTable)) return false;
  if (!await context.canRead({ action: 'Fallback.Import', resource: { type: 'Event', id: context.scope.eventId } })) return false;
  const table = row.targetTable as 'Registration' | 'FootfallTick';
  const rows = await workspaceImportCaptureIds(context, { id: row.id, table });
  if (rows.length !== row.rowCount) return false;
  for (const capture of rows) if (!await context.canRead({ action: 'Record.Void', resource: { type: table, id: capture.id } })) return false;
  return true;
}
async function related(context: ReadContext, row: Row) {
  const links = await actorRelated(context, row.importedById);
  const stations = await readableStationIds(context, 'Dashboard.ReadStation');
  if (row.fallbackWindowId) {
    const window = await workspaceWindowStation(context, row.fallbackWindowId);
    if (window && (window.stationId ? stations.includes(window.stationId) : stations.length > 0))
      links.push(entityLink('Proven fallback window', { kind: 'fallback', id: row.fallbackWindowId }));
  }
  if (stations.length > 0 && row.provenanceVersion === 1 && ['Registration', 'FootfallTick'].includes(row.targetTable))
    links.push(recordsLink('Permitted inserted capture rows', { kind: row.targetTable === 'Registration' ? 'registrations' : 'footfall',
      importBatchId: row.id, rehearsal: row.rehearsal }));
  return links;
}
async function entity(context: ReadContext, ref: EntityRef) {
  const metadata = await workspaceBatchMetadata(context, ref.id);
  if (!metadata) return null;
  await requireImportRead(context, { archived: metadata.event.status === 'ARCHIVED', targetTable: metadata.targetTable });
  const row = await workspaceBatch(context, ref.id);
  if (!row) return null;
  const result = entityProjection(context, ref, { title: `${row.targetTable} import`, fields: fields(row), related: await related(context, row) });
  if (await undoAllowed(context, row)) result.actions.push({ label: 'Undo retained capture import', destination: { type: 'action', path: '/chief/imports', query: { id: row.id } } });
  else result.facets.push({ name: 'Undo', availability: 'unavailable', explanation: 'Only exact new capture imports with current authority on every row support undo. Legacy and roster imports need individual review.' });
  return result;
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'imports') throw new ValidationError('Choose import history.');
  const targetTable = filter.importType ? tables[filter.importType] : undefined;
  const event = await workspaceImportEvent(context);
  await requireImportRead(context, { archived: event.status === 'ARCHIVED', ...(targetTable ? { targetTable } : {}) });
  const result = await workspaceBatches(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, importedAt: await observedTime(context, filter), ...(targetTable ? { targetTable } : {}),
      ...(filter.personId ? { importedById: filter.personId } : {}), ...(filter.fallbackWindowId ? { fallbackWindowId: filter.fallbackWindowId } : {}) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: `${row.targetTable} import`, recordedAt: row.importedAt.toISOString(),
    fields: fields(row), destination: { kind: 'import' as const, id: row.id }, related: await related(context, row) }));
  return recordsProjection(context, request, { data, count: result.count, aggregate: { value: result.count, unit: 'imports' }, nextCursor: page.nextCursor });
}
export const importWorkspaceSource: WorkspaceSource = { entity, records };
