import type { EntityRef, RecordsFilter, RecordsRequest, SearchRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { entityLink, entityProjection, field, recordsProjection, readableCollectionStations, requireRead, requireSelfRead } from '../../../platform/workspace/sourceRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { recordsLink } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { workspaceCard, workspaceCards, workspaceCardSearch, workspaceCardStation, workspaceReplacements, workspaceCardJourney } from '../data/workspaceRepo.js';

type Row = NonNullable<Awaited<ReturnType<typeof workspaceCard>>>;
const fields = (row: Row) => [field('Code', row.shortCode), field('Status', row.status),
  field('Practice', row.rehearsal, 'boolean'), field('Issued at', row.issuedAt?.toISOString() ?? null, 'instant'),
  field('Completed at', row.completedAt?.toISOString() ?? null, 'instant')];
async function entity(context: ReadContext, ref: EntityRef) {
  await requireSelfRead(context);
  const row = await workspaceCard(context, ref.id);
  if (!row) return null;
  const journey = await workspaceCardJourney(context, { id: row.id, rehearsal: row.rehearsal, asOf: context.now });
  const related = (await workspaceReplacements(context, row.id)).map((card) => entityLink(`Replacement ${card.shortCode}`, { kind: 'card', id: card.id }));
  if (row.reissuedFromId) related.push(entityLink('Previous card', { kind: 'card', id: row.reissuedFromId }));
  const stations = await readableCollectionStations(context, 'Dashboard.ReadStation').catch((error: unknown) => {
    if (error instanceof Error && 'statusCode' in error && error.statusCode === 403) return [];
    throw error;
  });
  related.push(...journey.left.map((station) => entityLink(`Still to visit: ${station.name}`, { kind: 'station', id: station.id })));
  if (stations.length) related.push(recordsLink('Stamp history', { kind: 'stamps', cardId: row.id, rehearsal: row.rehearsal }),
    recordsLink('Registrations and group', { kind: 'registrations', cardId: row.id, rehearsal: row.rehearsal }),
    recordsLink('Redemptions', { kind: 'redemptions', cardId: row.id, rehearsal: row.rehearsal }));
  const result = entityProjection(context, ref, { title: `Card ${row.shortCode}`,
    fields: [...fields(row), field('Redeemed', journey.redeemed, 'boolean'), field('Stations left', journey.leftCount, 'number')], related });
  if (journey.leftCount > journey.left.length) result.facets.push({ name: 'Stations left', availability: 'available',
    explanation: 'Showing the first 50 station links. The count includes every remaining active stamping station.' });
  if (await context.canRead({ action: 'Card.Void', resource: { type: 'MissionCard', id: row.id } }))
    result.actions.push({ label: 'Card corrections', destination: { type: 'action', path: '/admin/cards', query: { cardId: row.id } } });
  return result;
}
function commonCardFilter(context: ReadContext, filter: Extract<RecordsFilter, { kind: 'cards' }>) {
  return { eventId: context.scope.eventId, ...capturePool(filter),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.groupId ? { registrations: { some: { eventId: context.scope.eventId, groupId: filter.groupId } } } : {}) };
}
async function whereCards(context: ReadContext, filter: Extract<RecordsFilter, { kind: 'cards' }>) {
  await readableCollectionStations(context, 'Dashboard.ReadStation');
  const time = await observedTime(context, filter);
  const common = commonCardFilter(context, filter);
  if (filter.stage === 'station') {
    const station = await workspaceCardStation(context, { ...(filter.stationId ? { id: filter.stationId } : {}), ...(filter.stationCode ? { code: filter.stationCode } : {}) });
    if (!station) throw new NotFoundError('Station');
    await requireRead(context, 'Dashboard.ReadStation', { type: 'Station', id: station.id });
    return { ...common, AND: [{ status: { not: 'LOST' as const } }], stampEvents: { some: { eventId: context.scope.eventId,
      stationId: station.id, recordedAt: time, ...capturePool(filter) } } };
  }
  if (filter.stage === 'redeemed') return { ...common, redemptions: { some: { eventId: context.scope.eventId,
    voided: false, recordedAt: time, ...capturePool(filter) } } };
  if (filter.stage === 'issued' || filter.stage === 'completed') return { ...common, issuedAt: time,
    AND: [{ status: filter.stage === 'completed' ? 'COMPLETED' as const : { notIn: ['UNISSUED' as const, 'LOST' as const] } }] };
  return { ...common, createdAt: time };
}
async function records(context: ReadContext, request: RecordsRequest) {
  if (request.filter.kind !== 'cards') throw new ValidationError('Choose card records.');
  const result = await workspaceCards(context, { where: await whereCards(context, request.filter), limit: request.limit,
    ...(request.cursor ? { cursor: request.cursor } : {}) });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  return recordsProjection(context, request, { count: result.count, aggregate: { value: result.count, unit: 'cards' }, nextCursor: page.nextCursor,
    data: page.rows.map((row) => ({ id: row.id, title: row.shortCode, recordedAt: row.issuedAt?.toISOString() ?? null,
      fields: fields(row), destination: { kind: 'card', id: row.id }, related: [] })) });
}
async function search(context: ReadContext, input: SearchRequest) {
  await requireSelfRead(context);
  return (await workspaceCardSearch(context, input)).map((row) => ({ title: `Card ${row.shortCode}`, detail: row.status,
    destination: { kind: 'card' as const, id: row.id } }));
}
export const cardWorkspaceSource: WorkspaceSource = { entity, records, search };
