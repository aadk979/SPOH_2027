import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase as ReadContext } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';

const projection = { id: true, stationId: true, recordedAt: true, source: true, rehearsal: true,
  voided: true, recordedById: true, quantity: true, timeBlockStart: true, importBatchId: true,
  importBatch: { select: { id: true, targetTable: true, event: { select: { status: true } } } } } as const;
export function footfallStation(context: ReadContext, id: string) {
  return context.db.footfallTick.findFirst({ where: { eventId: context.scope.eventId, id }, select: { stationId: true } });
}
export function footfallWorkspaceRow(context: ReadContext, id: string) {
  return context.db.footfallTick.findFirst({ where: { eventId: context.scope.eventId, id }, select: projection });
}
export async function footfallWorkspacePage(context: ReadContext, input: {
  where: Prisma.FootfallTickWhereInput; limit: number; cursor?: string;
}) {
  const anchor = input.cursor ? await context.db.footfallTick.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, recordedAt: true } }) : null;
  const totals = await (context.db.footfallTick.aggregate({ where: input.where, _count: { _all: true }, _sum: { quantity: true } }));
  const rows = await (context.db.footfallTick.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.recordedAt } : null, 'recordedAt')] },
    select: projection, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count: totals._count._all, quantity: totals._sum.quantity ?? 0, rows, cursorValid: !input.cursor || !!anchor };
}
