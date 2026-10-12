import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase as ReadContext } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';

const projection = { id: true, stationId: true, recordedAt: true, source: true, rehearsal: true,
  voided: true, voidedReason: true, recordedById: true, groupId: true, missionCardId: true, importBatchId: true,
  importBatch: { select: { id: true, targetTable: true, event: { select: { status: true } } } },
  captureCategory: { select: { code: true, label: true } } } as const;
export function registrationStation(context: ReadContext, id: string) {
  return context.db.registration.findFirst({ where: { eventId: context.scope.eventId, id }, select: { stationId: true } });
}
export function registrationWorkspaceRow(context: ReadContext, id: string) {
  return context.db.registration.findFirst({ where: { eventId: context.scope.eventId, id }, select: projection });
}
export async function registrationWorkspacePage(context: ReadContext, input: {
  where: Prisma.RegistrationWhereInput; limit: number; cursor?: string;
}) {
  const anchor = input.cursor ? await context.db.registration.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, recordedAt: true } }) : null;
  const count = await (context.db.registration.count({ where: input.where }));
  const rows = await (context.db.registration.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.recordedAt } : null, 'recordedAt')] },
    select: projection, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
