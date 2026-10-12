import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';
import { IncidentSeverity, IncidentStatus, IncidentType } from '@spoh/shared';

const metadata = { id: true, type: true, severity: true, status: true, rehearsal: true,
  stationId: true, reportedById: true, occurredAt: true, reportedAt: true } as const;
export function incidentWorkspaceMetadata(context: ReadDatabase, id: string) {
  return context.db.incident.findFirst({ where: { eventId: context.scope.eventId, id }, select: metadata });
}
export function incidentWorkspaceBody(context: ReadDatabase, id: string) {
  return context.db.incident.findFirst({ where: { eventId: context.scope.eventId, id }, select: {
    ...metadata, description: true, locationNote: true,
    followUps: { select: { id: true, note: true, createdAt: true, authorId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 },
    _count: { select: { followUps: true } },
  } });
}
export async function incidentWorkspacePage(context: ReadDatabase, input: {
  where: Prisma.IncidentWhereInput; limit: number; cursor?: string;
}) {
  const anchor = input.cursor ? await context.db.incident.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, reportedAt: true } }) : null;
  const count = await (context.db.incident.count({ where: input.where }));
  const rows = await (context.db.incident.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.reportedAt } : null, 'reportedAt')] },
    select: metadata, orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export function incidentWorkspaceSearch(context: ReadDatabase, input: { query: string; limit: number }) {
  const query = input.query.toUpperCase();
  const search: Prisma.IncidentWhereInput = 'INCIDENT'.includes(query) ? {} : { OR: [
    { id: { contains: input.query, mode: 'insensitive' } }, { type: { in: IncidentType.options.filter((value) => value.includes(query)) } },
    { severity: { in: IncidentSeverity.options.filter((value) => value.includes(query)) } },
    { status: { in: IncidentStatus.options.filter((value) => value.includes(query)) } },
  ] };
  return context.db.incident.findMany({ where: { eventId: context.scope.eventId,
    ...search }, select: metadata,
    orderBy: [{ reportedAt: 'desc' }, { id: 'desc' }], take: input.limit });
}
