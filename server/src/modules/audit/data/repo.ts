import { pageArgs } from '../../../platform/db/pagination.js';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export interface AuditFilter {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
}

/**
 * A page of audit entries matching every given filter, newest first: the
 * event's own rows. Global rows have no proven organisation ownership and must
 * never be included in an event feed (ADR-001 §2).
 */
export async function findAuditEntries(
  scope: EventScope,
  filter: AuditFilter,
  page: { limit: number; cursor?: string },
) {
  return prisma.auditLog.findMany({
    where: {
      eventId: scope.eventId,
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    },
    include: { actor: { select: { displayName: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(page),
  });
}

export type AuditEntryRow = Awaited<ReturnType<typeof findAuditEntries>>[number];
