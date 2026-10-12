import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { RecordsRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { field, recordsProjection } from '../../../platform/workspace/sourceRead.js';
import { captureStations } from '../../../platform/workspace/captureRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, cardRelated, stationRelated } from '../../../platform/workspace/related.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { workspaceStamps } from '../data/workspaceRepo.js';

async function records(context: ReadContext, request: RecordsRequest) {
  const filter = request.filter;
  if (filter.kind !== 'stamps') throw new ValidationError('Choose stamp records.');
  const stationIds = await captureStations(context, filter);
  const result = await workspaceStamps(context, { limit: request.limit, ...(request.cursor ? { cursor: request.cursor } : {}),
    where: { eventId: context.scope.eventId, stationId: { in: stationIds }, recordedAt: await observedTime(context, filter),
      ...capturePool(filter), ...(filter.personId ? { recordedById: filter.personId } : {}),
      ...(filter.source ? { source: filter.source } : {}), ...(filter.cardId ? { missionCardId: filter.cardId } : {}),
      ...(filter.excludeLost === undefined ? {} : { missionCard: { eventId: context.scope.eventId,
        status: filter.excludeLost ? { not: 'LOST' } : 'LOST' } }) } });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: 'Station stamp',
    recordedAt: row.recordedAt.toISOString(), fields: [field('Source', row.source), field('Practice', row.rehearsal, 'boolean')],
    destination: null, related: [...await stationRelated(context, row.stationId), ...await cardRelated(context, row.missionCardId),
      ...await actorRelated(context, row.recordedById)] }));
  return recordsProjection(context, request, { data, count: result.count, aggregate: { value: result.count, unit: 'stampRows' }, nextCursor: page.nextCursor });
}
export const stampWorkspaceSource: WorkspaceSource = { entity: async () => null, records };
