import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordsRequest, SearchRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { entityProjection, field, recordsProjection, readableCollectionStations } from '../../../platform/workspace/sourceRead.js';
import { boundedPage, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, recordsLink } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { workspaceGift, workspaceGiftSearch, workspaceGiftTotals } from '../data/workspaceRepo.js';
import { workspaceGiftLedger } from '../data/workspaceLedgerRepo.js';

async function entity(context: ReadContext, ref: EntityRef) {
  await readableCollectionStations(context, 'Dashboard.ReadStation');
  const gift = await workspaceGift(context, ref.id);
  if (!gift) return null;
  const live = await (workspaceGiftTotals(context, { giftTypeId: gift.id, rehearsal: false, asOf: context.now }));
  const practice = await (workspaceGiftTotals(context, { giftTypeId: gift.id, rehearsal: true, asOf: context.now }));
  const result = entityProjection(context, ref, { title: gift.name,
    fields: [field('Active', gift.active, 'boolean'), field('Live remaining', gift.initialStock + live.adjustment - live.redemptions, 'number'),
      field('Practice remaining', gift.rehearsalInitialStock + practice.adjustment - practice.redemptions, 'number'), field('Low-stock threshold', gift.lowStockThreshold, 'number')],
    related: [recordsLink('Live stock ledger', { kind: 'gift-ledger', giftTypeId: gift.id, rehearsal: false }),
      recordsLink('Practice stock ledger', { kind: 'gift-ledger', giftTypeId: gift.id, rehearsal: true }),
      recordsLink('Live redemptions', { kind: 'redemptions', giftTypeId: gift.id, rehearsal: false })] });
  if (await context.canRead({ action: 'Count.Adjust', resource: { type: 'GiftType', id: gift.id } }))
    result.actions.push({ label: 'Adjust stock with a reason', destination: { type: 'action', path: '/admin/gifts', query: { id: gift.id } } });
  return result;
}
async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'gift-ledger') throw new ValidationError('Choose a gift stock ledger.');
  const stations = await readableCollectionStations(context, 'Dashboard.ReadStation');
  const gift = await workspaceGift(context, filter.giftTypeId);
  if (!gift) throw new NotFoundError('Gift');
  const time = await observedTime(context, filter);
  const result = await (workspaceGiftLedger(context, { giftTypeId: gift.id, rehearsal: filter.rehearsal,
    time, limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}) }));
  const totals = await (workspaceGiftTotals(context, { giftTypeId: gift.id, rehearsal: filter.rehearsal, asOf: time.lte }));
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const openingStock = filter.rehearsal ? gift.rehearsalInitialStock : gift.initialStock;
  const data = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: row.kind === 'adjustment' ? 'Stock adjustment' : 'Gift redemption',
    recordedAt: row.at.toISOString(), fields: [field('Stock change', row.delta, 'number'), field('Reason', row.reason), field('Voided', row.voided, 'boolean')],
    destination: row.kind === 'redemption' && row.stationId && stations.includes(row.stationId)
      ? { kind: 'redemption' as const, id: row.recordId } : null, related: await actorRelated(context, row.actorId) }));
  return recordsProjection(context, request, { data, count: result.count, nextCursor: page.nextCursor,
    aggregate: { value: result.value, unit: 'stock', openingStock, balance: openingStock + totals.adjustment - totals.redemptions,
      explanation: 'Balance uses all retained history in this exact pool; displayed changes use the selected interval.' } });
}
async function search(context: ReadContext, input: SearchRequest) {
  await readableCollectionStations(context, 'Dashboard.ReadStation');
  return (await workspaceGiftSearch(context, input)).map((gift) => ({ title: gift.name, detail: gift.active ? 'Gift' : 'Retired gift', destination: { kind: 'gift' as const, id: gift.id } }));
}
export const giftWorkspaceSource: WorkspaceSource = { entity, records, search };
