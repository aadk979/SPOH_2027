import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
export async function lockImportBatch(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE "eventId" = ${scope.eventId} AND id = ${id} FOR UPDATE`;
  return tx.importBatch.findFirst({ where: { eventId: scope.eventId, id },
    select: { id: true, targetTable: true, rowCount: true, provenanceVersion: true, undoneAt: true } });
}
export async function retainedImportRows(tx: PrismaTransactionClient, scope: EventScope,
  input: { id: string; targetTable: 'Registration' | 'FootfallTick' }) {
  if (input.targetTable === 'Registration') {
    await tx.$queryRaw`SELECT id FROM "Registration" WHERE "eventId" = ${scope.eventId}
      AND "importBatchId" = ${input.id} ORDER BY id FOR UPDATE`;
    return tx.registration.findMany({ where: { eventId: scope.eventId, importBatchId: input.id },
      select: { id: true, voided: true }, orderBy: { id: 'asc' } });
  }
  await tx.$queryRaw`SELECT id FROM "FootfallTick" WHERE "eventId" = ${scope.eventId}
    AND "importBatchId" = ${input.id} ORDER BY id FOR UPDATE`;
  return tx.footfallTick.findMany({ where: { eventId: scope.eventId, importBatchId: input.id },
    select: { id: true, voided: true }, orderBy: { id: 'asc' } });
}
export async function voidImportRow(tx: PrismaTransactionClient, scope: EventScope,
  input: { batchId: string; id: string; targetTable: 'Registration' | 'FootfallTick'; reason: string; now: Date }) {
  const where = { eventId: scope.eventId, id: input.id, importBatchId: input.batchId, voided: false };
  const data = { voided: true, voidedReason: input.reason };
  if (input.targetTable === 'Registration') return tx.registration.updateMany({ where, data });
  // Footfall's retained correction has a reason in its audit; it has no reason column.
  return tx.footfallTick.updateMany({ where, data: { voided: true } });
}
