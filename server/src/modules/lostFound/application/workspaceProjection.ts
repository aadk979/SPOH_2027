import type { EntityRef, RecordRow, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { entityProjection, field } from '../../../platform/workspace/sourceRead.js';
import { actorRelated, auditRelated, stationRelated } from '../../../platform/workspace/related.js';
import type { WorkspaceFoundItem } from '../data/workspaceRepo.js';

function foundFields(item: WorkspaceFoundItem) {
  return [field('Category', item.categoryLabel), field('Status', item.status), field('Found', item.foundAt.toISOString(), 'instant'),
    field('Held at', item.holderNote), field('Claimed', item.claimedAt?.toISOString() ?? null, 'instant'),
    field('Rehearsal', item.rehearsal, 'boolean'), field('Photo available', item.photoKey !== null, 'boolean')];
}

export async function foundProjection(context: ReadContext, ref: EntityRef, item: WorkspaceFoundItem) {
  const related = [...await stationRelated(context, item.foundStationId), ...await actorRelated(context, item.loggedById),
    ...await auditRelated(context, { kind: 'lost-found', type: 'LostFoundItem', id: item.id })];
  const actions: WorkspaceLink[] = item.photoKey ? [{ label: 'View item photo',
    destination: { type: 'action', path: '/safety/lost-found', query: { id: item.id } } }] : [];
  if (item.status === 'HELD' && await context.canRead({ action: 'LostFound.Claim', resource: { type: 'LostFoundItem', id: item.id } })) {
    actions.push({ label: 'Mark item claimed', destination: { type: 'action', path: '/safety/lost-found', query: { id: item.id } } });
  }
  return entityProjection(context, ref, { title: item.itemLabel, fields: foundFields(item), related, actions });
}

export function foundRecord(item: WorkspaceFoundItem): RecordRow {
  return { id: item.id, title: item.itemLabel.slice(0, 240), recordedAt: item.foundAt.toISOString(), fields: foundFields(item),
    destination: { kind: 'lost-found', id: item.id }, related: [] };
}
