import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';

const windowSelect = { id: true, stationId: true, tier: true, startedAt: true, endedAt: true, rehearsal: true,
  declaredById: true, reason: true } as const;
const batchSelect = { id: true, targetTable: true, source: true, rowCount: true, importedAt: true, rehearsal: true,
  fallbackWindowId: true, importedById: true, provenanceVersion: true, undoneAt: true, fileName: true, notes: true } as const;
export function workspaceWindowStation(context: ReadDatabase, id: string) {
  return context.db.fallbackWindow.findFirst({ where: { eventId: context.scope.eventId, id }, select: { stationId: true } });
}
export function workspaceWindow(context: ReadDatabase, id: string) {
  return context.db.fallbackWindow.findFirst({ where: { eventId: context.scope.eventId, id }, select: windowSelect });
}
export function workspaceBatchMetadata(context: ReadDatabase, id: string) {
  return context.db.importBatch.findFirst({ where: { eventId: context.scope.eventId, id },
    select: { targetTable: true, event: { select: { status: true } } } });
}
export function workspaceBatch(context: ReadDatabase, id: string) {
  return context.db.importBatch.findFirst({ where: { eventId: context.scope.eventId, id }, select: batchSelect });
}
export async function workspaceWindows(context: ReadDatabase, input: { where: Prisma.FallbackWindowWhereInput; cursor?: string; limit: number }) {
  const anchor = input.cursor ? await context.db.fallbackWindow.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, startedAt: true } }) : null;
  const count = await (context.db.fallbackWindow.count({ where: input.where }));
  const rows = await (context.db.fallbackWindow.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.startedAt } : null, 'startedAt')] }, select: windowSelect,
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export async function workspaceBatches(context: ReadDatabase, input: { where: Prisma.ImportBatchWhereInput; cursor?: string; limit: number }) {
  const anchor = input.cursor ? await context.db.importBatch.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, importedAt: true } }) : null;
  const count = await (context.db.importBatch.count({ where: input.where }));
  const rows = await (context.db.importBatch.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.importedAt } : null, 'importedAt')] }, select: batchSelect,
    orderBy: [{ importedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export function workspaceImportEvent(context: ReadDatabase) {
  return context.db.event.findUniqueOrThrow({ where: { id: context.scope.eventId }, select: { status: true } });
}
export async function workspaceImportCaptureIds(context: ReadDatabase, input: { id: string; table: 'Registration' | 'FootfallTick' }) {
  const where = { eventId: context.scope.eventId, importBatchId: input.id };
  const select = { id: true } as const;
  return input.table === 'Registration' ? context.db.registration.findMany({ where, select, orderBy: { id: 'asc' } })
    : context.db.footfallTick.findMany({ where, select, orderBy: { id: 'asc' } });
}
