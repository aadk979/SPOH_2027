import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { prisma } from '../../../platform/db/client.js';

export async function lockExportEvent(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { status: true, lifecycleVersion: true },
  });
}
export const saveArchiveExport = (
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    snapshotId: string;
    lifecycleVersion: number;
    objectKey: string;
    now: Date;
  },
) =>
  input.tx.archiveExport.create({
    data: {
      id: input.id,
      eventId: scope.eventId,
      snapshotId: input.snapshotId,
      lifecycleVersion: input.lifecycleVersion,
      objectKey: input.objectKey,
      createdAt: input.now,
    },
  });
export const archiveExportRow = (scope: EventScope, id: string) =>
  prisma.archiveExport.findFirst({ where: { eventId: scope.eventId, id } });
export const archiveExportRows = (scope: EventScope) =>
  prisma.archiveExport.findMany({
    where: { eventId: scope.eventId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
  });
export const completedArchiveExport = (
  scope: EventScope,
  input: { tx: PrismaTransactionClient; lifecycleVersion: number },
) =>
  input.tx.archiveExport.findFirst({
    where: {
      eventId: scope.eventId,
      lifecycleVersion: input.lifecycleVersion,
      snapshot: { supersededAt: null },
    },
    select: { id: true },
  });
