import { ERROR_CODES, type UndoCaptureImportRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { lockImportBatch, retainedImportRows, voidImportRow } from '../data/undoRepo.js';

type UndoActor = ActorContext & { clock?: Clock };
interface OwnedRows { id: string; targetTable: 'Registration' | 'FootfallTick'; rows: Array<{ id: string; voided: boolean }> }
async function loadOwnedRows(tx: PrismaTransactionClient, actor: UndoActor, id: string): Promise<OwnedRows> {
  const batch = await lockImportBatch(tx, actor.scope, id);
  if (!batch) throw new NotFoundError('Import');
  if (batch.provenanceVersion !== 1 || !['Registration', 'FootfallTick'].includes(batch.targetTable))
    throw new ConflictError(ERROR_CODES.CONFLICT, 'This import has no exact capture ownership. Review individual records instead.');
  if (batch.undoneAt) throw new ConflictError(ERROR_CODES.CONFLICT, 'This import was already undone.');
  const targetTable = batch.targetTable as OwnedRows['targetTable'];
  const rows = await retainedImportRows(tx, actor.scope, { id, targetTable });
  if (rows.length !== batch.rowCount) throw new ConflictError(ERROR_CODES.CONFLICT, 'The retained import rows do not match its receipt.');
  return { id, targetTable, rows };
}
async function requireRowAuthority(tx: PrismaTransactionClient, actor: UndoActor, owned: OwnedRows) {
  for (const row of owned.rows) await requireCurrentPermission(tx, { scope: actor.scope, personId: actor.volunteerId,
    membershipId: actor.membershipId, action: 'Record.Void', resource: { type: owned.targetTable, id: row.id }, clock: actor.clock });
}
async function voidOwnedRows(tx: PrismaTransactionClient, actor: UndoActor,
  input: { owned: OwnedRows; reason: string; now: Date }) {
  const { owned, reason, now } = input;
  let voided = 0;
  for (const row of owned.rows) {
    if (row.voided) continue;
    const changed = await voidImportRow(tx, actor.scope, { batchId: owned.id, id: row.id, targetTable: owned.targetTable, reason, now });
    if (changed.count !== 1) throw new ConflictError(ERROR_CODES.CONFLICT, 'An imported record changed. Review the import again.');
    voided += 1;
    await writeAudit(tx, { ...actor.audit, action: owned.targetTable === 'Registration' ? 'registration.void' : 'footfall.void',
      entityType: owned.targetTable, entityId: row.id, before: { voided: false }, after: { voided: true, reason, importBatchId: owned.id } });
  }
  return { importBatchId: owned.id, voided, alreadyVoided: owned.rows.length - voided, retained: owned.rows.length };
}

/** Atomic retained undo uses exact new provenance, never timestamp inference. */
export function undoCaptureImport(id: string, request: UndoCaptureImportRequest,
  actor: ActorContext & { clock?: Clock }) {
  return prisma.$transaction(async (tx) => {
    const { scope } = actor;
    const event = await holdCaptureEvent(tx, scope);
    if (event.status === 'ARCHIVED') throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived imports cannot be undone.');
    await requireCurrentPermission(tx, { scope, personId: actor.volunteerId, membershipId: actor.membershipId,
      action: 'Fallback.Import', clock: actor.clock });
    await lockReserved(tx, scope, request.idempotencyKey);
    const owned = await loadOwnedRows(tx, actor, id);
    await requireRowAuthority(tx, actor, owned);
    const now = (actor.clock ?? systemClock).now();
    const result = await voidOwnedRows(tx, actor, { owned, reason: request.reason, now });
    await tx.importBatch.update({ where: { eventId: scope.eventId, id }, data: { undoneAt: now, undoReason: request.reason } });
    await writeAudit(tx, { ...actor.audit, action: 'import.undo', entityType: 'ImportBatch', entityId: id,
      after: { ...result, reason: request.reason } });
    await settleReserved(tx, scope, { key: request.idempotencyKey, statusCode: 200, body: result });
    return result;
  }, { timeout: 30_000 });
}
