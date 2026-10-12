import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';
import { LostPersonStatus } from '@spoh/shared';

const metadata = { id: true, status: true, rehearsal: true, raisedAt: true, resolvedAt: true,
  lastSeenAt: true, lastSeenStationId: true, raisedById: true } as const;
export function lostPersonWorkspaceRow(context: ReadDatabase, id: string) {
  return context.db.lostPersonAlert.findFirst({ where: { eventId: context.scope.eventId, id }, select: metadata });
}
/** The final query rechecks ACTIVE and practice standing, so resolution never returns descriptors. */
export function activeWorkspaceDescription(context: ReadDatabase, id: string) {
  return context.db.lostPersonAlert.findFirst({ where: { eventId: context.scope.eventId, id, status: 'ACTIVE',
    OR: [{ rehearsal: false }, { rehearsal: true, event: { status: 'REHEARSAL' } }] },
    select: { approxAge: true, descriptionText: true, clothingText: true,
      raisedBy: { select: { displayName: true, phone: true } } } });
}
export async function lostPersonWorkspacePage(context: ReadDatabase, input: {
  where: Prisma.LostPersonAlertWhereInput; limit: number; cursor?: string;
}) {
  const anchor = input.cursor ? await context.db.lostPersonAlert.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, raisedAt: true } }) : null;
  const count = await (context.db.lostPersonAlert.count({ where: input.where }));
  const rows = await (context.db.lostPersonAlert.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.raisedAt } : null, 'raisedAt')] },
    select: metadata, orderBy: [{ raisedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export function ownWorkspaceAlertAck(context: ReadDatabase, input: { id: string; personId: string }) {
  return context.db.lostPersonAck.findFirst({ where: { eventId: context.scope.eventId,
    alertId: input.id, volunteerId: input.personId }, select: { id: true } });
}
export function lostPersonWorkspaceSearch(context: ReadDatabase, input: { query: string; limit: number }) {
  const query = input.query.toUpperCase();
  const search: Prisma.LostPersonAlertWhereInput = 'LOST-PERSON ALERT'.includes(query) ? {} : { OR: [
    { id: { contains: input.query, mode: 'insensitive' } },
    { status: { in: LostPersonStatus.options.filter((value) => value.includes(query)) } },
  ] };
  return context.db.lostPersonAlert.findMany({ where: { eventId: context.scope.eventId,
    ...search }, select: metadata,
    orderBy: [{ raisedAt: 'desc' }, { id: 'desc' }], take: input.limit });
}
