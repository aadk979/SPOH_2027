import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordsRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { entityProjection, field, recordsProjection, readableCollectionStations, requireRead } from '../../../platform/workspace/sourceRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, recordsLink, stationRelated } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { workspaceWindow, workspaceWindowStation, workspaceWindows } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof workspaceWindow>>>;
const fields = (row: Row) => [field('Tier', row.tier, 'number'), field('Reason', row.reason), field('Practice', row.rehearsal, 'boolean'),
  field('Started at', row.startedAt.toISOString(), 'instant'), field('Ended at', row.endedAt?.toISOString() ?? null, 'instant')];
async function related(context: ReadContext, row: Row) {
  const links = [...await stationRelated(context, row.stationId), ...await actorRelated(context, row.declaredById)];
  if (await context.canRead({ action: 'Audit.Read', resource: { type: 'Event', id: context.scope.eventId } }))
    links.push(recordsLink('Associated imports', { kind: 'imports', fallbackWindowId: row.id }));
  if (await context.canRead({ action: 'Report.Export', resource: { type: 'Event', id: context.scope.eventId } }))
    links.push({ label: 'Report caveats', destination: { type: 'action', path: '/reports' } });
  return links;
}
async function entity(context: ReadContext, ref: EntityRef) {
  const metadata = await workspaceWindowStation(context, ref.id);
  if (!metadata) return null;
  if (metadata.stationId) await requireRead(context, 'Dashboard.ReadStation', { type: 'Station', id: metadata.stationId });
  else await readableCollectionStations(context, 'Dashboard.ReadStation');
  const row = await workspaceWindow(context, ref.id);
  return row ? entityProjection(context, ref, { title: `Tier ${row.tier} fallback window`, fields: fields(row), related: await related(context, row) }) : null;
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'fallback') throw new ValidationError('Choose fallback windows.');
  const stationIds = await readableCollectionStations(context, 'Dashboard.ReadStation', filter.stationId);
  const result = await workspaceWindows(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, startedAt: await observedTime(context, filter), ...capturePool(filter),
      OR: [{ stationId: null }, { stationId: { in: stationIds } }], ...(filter.open === undefined ? {} : { endedAt: filter.open ? null : { not: null } }) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: `Tier ${row.tier} fallback window`,
    recordedAt: row.startedAt.toISOString(), fields: fields(row), destination: { kind: 'fallback' as const, id: row.id }, related: await related(context, row) }));
  return recordsProjection(context, request, { data, count: result.count, aggregate: { value: result.count, unit: 'windows' }, nextCursor: page.nextCursor });
}
export const fallbackWorkspaceSource: WorkspaceSource = { entity, records };
