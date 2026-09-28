import type { AuditEntryRow } from './repo.js';

export function toAuditEntryRecord(entry: AuditEntryRow) {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actorId: entry.actorId,
    actorName: entry.actor?.displayName ?? 'System',
    before: entry.before,
    after: entry.after,
    requestId: entry.requestId,
    createdAt: entry.createdAt.toISOString(),
  };
}
