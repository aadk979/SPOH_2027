import type { RecordsFilter, SearchRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';

const itemFields = { id: true, itemLabel: true, categoryLabel: true, foundStationId: true, foundAt: true,
  holderNote: true, status: true, loggedById: true, claimedAt: true, rehearsal: true,
  photoKey: true } as const;
export type WorkspaceFoundItem = Prisma.LostFoundItemGetPayload<{ select: typeof itemFields }>;
type FoundFilter = Extract<RecordsFilter, { kind: 'lost-found' }>;
export interface FoundSelection { filter: FoundFilter; time: Prisma.DateTimeFilter; pool: { rehearsal?: boolean } }

function foundWhere(scope: EventScope, input: FoundSelection): Prisma.LostFoundItemWhereInput {
  return { eventId: scope.eventId, ...input.pool, foundAt: input.time,
    ...(input.filter.stationId ? { foundStationId: input.filter.stationId } : {}),
    ...(input.filter.personId ? { loggedById: input.filter.personId } : {}),
    ...(input.filter.status ? { status: input.filter.status } : {}) };
}

export function workspaceFoundItem(scope: EventScope, db: PrismaTransactionClient, id: string) {
  return db.lostFoundItem.findFirst({ where: { eventId: scope.eventId, id }, select: itemFields });
}

export function foundCursor(scope: EventScope, db: PrismaTransactionClient, input: FoundSelection & { cursor: string }) {
  return db.lostFoundItem.findFirst({ where: { ...foundWhere(scope, input), id: input.cursor }, select: { id: true, foundAt: true } });
}

export function countWorkspaceFoundItems(scope: EventScope, db: PrismaTransactionClient, input: FoundSelection) {
  return db.lostFoundItem.count({ where: foundWhere(scope, input) });
}

export function workspaceFoundPage(scope: EventScope, db: PrismaTransactionClient,
  input: FoundSelection & { limit: number; anchor: { id: string; at: Date } | null }) {
  return db.lostFoundItem.findMany({ where: { ...foundWhere(scope, input), ...afterTime(input.anchor, 'foundAt') },
    select: itemFields, orderBy: [{ foundAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 });
}

export function searchWorkspaceFoundItems(scope: EventScope, db: PrismaTransactionClient,
  input: { request: SearchRequest; asOf: Date; rehearsal: boolean }) {
  return db.lostFoundItem.findMany({ where: { eventId: scope.eventId, foundAt: { lte: input.asOf }, rehearsal: input.rehearsal,
    OR: [{ itemLabel: { contains: input.request.query, mode: 'insensitive' } },
      { categoryLabel: { contains: input.request.query, mode: 'insensitive' } }] }, select: itemFields,
    orderBy: [{ foundAt: 'desc' }, { id: 'desc' }], take: input.request.limit });
}

export function foundSearchMode(scope: EventScope, db: PrismaTransactionClient) {
  return db.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { status: true } });
}
