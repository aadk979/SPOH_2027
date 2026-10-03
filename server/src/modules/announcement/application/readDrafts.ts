import type { PaginationQuery } from '@spoh/shared';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toDraftRecord } from '../data/draftMapper.js';
import { findOwnDraft, listOwnDraftRows } from '../data/draftRepo.js';

export async function readOwnDraft(id: string, actor: ActorContext) {
  const row = await findOwnDraft(actor.scope, { id, authorId: actor.volunteerId });
  if (!row) throw new NotFoundError('Announcement draft');
  return toDraftRecord(row);
}

export async function listOwnDrafts(query: PaginationQuery, actor: ActorContext) {
  if (query.cursor) await readOwnDraft(query.cursor, actor);
  const rows = await listOwnDraftRows(actor.scope, { ...query, authorId: actor.volunteerId });
  const page = toPage(rows, query.limit);
  return {
    data: page.data.map(toDraftRecord),
    meta: { count: page.data.length, nextCursor: page.nextCursor },
  };
}
