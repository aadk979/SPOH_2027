import type { EntityRef, RecordsRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { cursorAnchor, recordsProjection, requireEventRead, requireSelfRead,
  type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { boundedPage, capturePool, observedTime } from '../../../platform/workspace/observation.js';
import { countWorkspaceFoundItems, foundCursor, foundSearchMode, searchWorkspaceFoundItems,
  workspaceFoundItem, workspaceFoundPage } from '../data/workspaceRepo.js';
import { foundProjection, foundRecord } from './workspaceProjection.js';

async function readFoundItem(context: ReadContext, ref: EntityRef) {
  if (ref.kind !== 'lost-found') return null;
  await requireSelfRead(context);
  const item = await workspaceFoundItem(context.scope, context.db, ref.id);
  return item ? foundProjection(context, ref, item) : null;
}

async function readFoundRecords(context: ReadContext, input: RecordsRequest) {
  if (input.filter.kind !== 'lost-found') throw new ValidationError('Choose found-item records.');
  await requireSelfRead(context);
  if (input.filter.personId && input.filter.personId !== context.personId) await requireEventRead(context, 'People.Read');
  const selection = { filter: input.filter, time: await observedTime(context, input.filter), pool: capturePool(input.filter) };
  const anchor = await cursorAnchor(input.cursor, (cursor) => foundCursor(context.scope, context.db, { ...selection, cursor }));
  const count = await countWorkspaceFoundItems(context.scope, context.db, selection);
  const page = boundedPage(await workspaceFoundPage(context.scope, context.db, { ...selection, limit: input.limit,
    anchor: anchor ? { id: anchor.id, at: anchor.foundAt } : null }), input.limit);
  return recordsProjection(context, input, { data: page.rows.map(foundRecord), count,
    aggregate: { value: count, unit: 'items' }, nextCursor: page.nextCursor });
}

export const lostFoundWorkspaceSource: WorkspaceSource = {
  entity: readFoundItem, records: readFoundRecords,
  async search(context, request) {
    await requireSelfRead(context);
    const event = await foundSearchMode(context.scope, context.db);
    const rows = await searchWorkspaceFoundItems(context.scope, context.db, { request, asOf: context.now, rehearsal: event.status === 'REHEARSAL' });
    return rows.map((item) => ({ title: item.itemLabel.slice(0, 240), detail: item.status,
      destination: { kind: 'lost-found' as const, id: item.id } }));
  },
};
