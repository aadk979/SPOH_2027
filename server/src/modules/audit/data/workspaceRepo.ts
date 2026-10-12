import type { RecordsFilter, SearchRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';

/** The generic workspace never loads audit payloads or transport/account identifiers. */
const auditFields = { id: true, actorId: true, action: true, severity: true, outcome: true, source: true,
  entityType: true, entityId: true, createdAt: true } as const;
export type WorkspaceAuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditFields }>;
type AuditFilter = Extract<RecordsFilter, { kind: 'audit' }>;
export interface AuditSelection { filter: AuditFilter; time: Prisma.DateTimeFilter }

function auditWhere(scope: EventScope, input: AuditSelection): Prisma.AuditLogWhereInput {
  return { eventId: scope.eventId, createdAt: input.time,
    ...(input.filter.action ? { action: input.filter.action } : {}),
    ...(input.filter.personId ? { actorId: input.filter.personId } : {}),
    ...(input.filter.entityType ? { entityType: input.filter.entityType } : {}),
    ...(input.filter.entityId ? { entityId: input.filter.entityId } : {}) };
}

export function workspaceAuditRow(scope: EventScope, db: PrismaTransactionClient, id: string) {
  return db.auditLog.findFirst({ where: { eventId: scope.eventId, id }, select: auditFields });
}

export function auditCursor(scope: EventScope, db: PrismaTransactionClient, input: AuditSelection & { cursor: string }) {
  return db.auditLog.findFirst({ where: { ...auditWhere(scope, input), id: input.cursor }, select: { id: true, createdAt: true } });
}

export function countWorkspaceAudit(scope: EventScope, db: PrismaTransactionClient, input: AuditSelection) {
  return db.auditLog.count({ where: auditWhere(scope, input) });
}

export function workspaceAuditPage(scope: EventScope, db: PrismaTransactionClient,
  input: AuditSelection & { limit: number; anchor: { id: string; at: Date } | null }) {
  return db.auditLog.findMany({ where: { ...auditWhere(scope, input), ...afterTime(input.anchor, 'createdAt') }, select: auditFields,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 });
}

export function searchWorkspaceAudit(scope: EventScope, db: PrismaTransactionClient, input: SearchRequest & { asOf: Date }) {
  return db.auditLog.findMany({ where: { eventId: scope.eventId, createdAt: { lte: input.asOf }, OR: [
    { action: { contains: input.query, mode: 'insensitive' } },
    { entityType: { contains: input.query, mode: 'insensitive' } },
  ] }, select: auditFields, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit });
}
