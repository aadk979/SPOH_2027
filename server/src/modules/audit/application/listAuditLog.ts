import { toPage, type Page } from '../../../platform/db/pagination.js';
import { toAuditEntryRecord } from '../data/mappers.js';
import { findAuditEntries } from '../data/repo.js';

/** One page of the audit log, filtered by action, entity, actor and time. */
export async function listAuditLog(query: {
  limit: number;
  cursor?: string | undefined;
  action?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  actorId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}): Promise<Page<ReturnType<typeof toAuditEntryRecord>>> {
  const rows = await findAuditEntries(
    {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    },
    { limit: query.limit, ...(query.cursor ? { cursor: query.cursor } : {}) },
  );
  const { data, nextCursor } = toPage(rows, query.limit);
  return { data: data.map(toAuditEntryRecord), nextCursor };
}
