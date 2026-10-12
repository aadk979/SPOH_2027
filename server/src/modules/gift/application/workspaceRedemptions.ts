import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordRow, RecordsRequest, RecordsFilter } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { entityLink, entityProjection, field, recordsProjection, requireRead } from '../../../platform/workspace/sourceRead.js';
import { captureStations } from '../../../platform/workspace/captureRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, cardRelated, stationRelated } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { workspaceRedemption, workspaceRedemptionStation, workspaceRedemptions } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof workspaceRedemption>>>;
const fields = (row: Row) => [field('Gift', row.giftType.name), field('Source', row.source), field('Practice', row.rehearsal, 'boolean'),
  field('Flag', row.flag), field('Voided', row.voided, 'boolean'), field('Void reason', row.voidedReason)];
async function related(context: ReadContext, row: Row) {
  return [entityLink('Gift and stock', { kind: 'gift', id: row.giftTypeId }), ...await stationRelated(context, row.stationId),
    ...await cardRelated(context, row.missionCardId), ...await actorRelated(context, row.recordedById)];
}
async function entity(context: ReadContext, ref: EntityRef) {
  const metadata = await workspaceRedemptionStation(context, ref.id);
  if (!metadata) return null;
  await requireRead(context, 'Dashboard.ReadStation', { type: 'Station', id: metadata.stationId });
  const row = await workspaceRedemption(context, ref.id);
  if (!row) return null;
  const result = entityProjection(context, ref, { title: `${row.giftType.name} redemption`, fields: fields(row), related: await related(context, row) });
  if (!row.voided && await context.canRead({ action: 'Record.Void', resource: { type: 'GiftRedemption', id: row.id } }))
    result.actions.push({ label: 'Correct this redemption', destination: { type: 'action', path: '/admin/corrections', query: { id: row.id, stationId: row.stationId } } });
  return result;
}
function redemptionFilters(filter: Extract<RecordsFilter, { kind: 'redemptions' }>) {
  return { ...(filter.giftTypeId ? { giftTypeId: filter.giftTypeId } : {}),
    ...(filter.cardId ? { missionCardId: filter.cardId } : {}), ...(filter.flagged === undefined ? {} : { flag: filter.flagged ? { not: null } : null }) };
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'redemptions') throw new ValidationError('Choose redemption records.');
  const stationIds = await captureStations(context, filter);
  const result = await workspaceRedemptions(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, stationId: { in: stationIds }, recordedAt: await observedTime(context, filter),
      ...capturePool(filter), voided: filter.voided ?? false, ...(filter.personId ? { recordedById: filter.personId } : {}),
      ...(filter.source ? { source: filter.source } : {}), ...redemptionFilters(filter) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data: RecordRow[] = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: row.giftType.name,
    recordedAt: row.recordedAt.toISOString(), fields: fields(row), destination: { kind: 'redemption', id: row.id }, related: await related(context, row) }));
  return recordsProjection(context, request, { data, count: result.count, aggregate: { value: result.count, unit: 'redemptions' }, nextCursor: page.nextCursor });
}
export const redemptionWorkspaceSource: WorkspaceSource = { entity, records };
