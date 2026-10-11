import type { ShiftTemplateRecord, UpdateShiftTemplateRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { requireStructureChange, requireStructureEdit } from '../../structure/index.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { eventTimezone } from '../../../platform/event/events.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toShiftTemplateRecord } from '../data/mappers.js';
import {
  findTemplateRow,
  listFollowingShifts,
  setShiftWindow,
  updateTemplateRow,
  type TemplateRow,
} from '../data/repo.js';
import { shiftWindow } from '../domain/shiftWindow.js';
import { assertTemplateHours } from '../domain/templateHours.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';

/** Every shift that still follows the template moves to its new hours. */
async function moveFollowingShifts(
  tx: PrismaTransactionClient,
  scope: EventScope,
  template: TemplateRow,
): Promise<void> {
  const timezone = await eventTimezone(scope);
  for (const shift of await listFollowingShifts(tx, scope, template.id)) {
    const date = shift.eventDay.date.toISOString().slice(0, 10);
    await setShiftWindow(tx, scope, { id: shift.id, ...shiftWindow(date, template, timezone) });
  }
}

/**
 * Rename a shift or move its hours (ADR-002). The hours decide when capture
 * and check-in are open, so the shifts that follow the template move with it,
 * in the same audited transaction; one the exceptions grid overrode stays.
 */
export async function updateShiftTemplate(
  id: string,
  patch: UpdateShiftTemplateRequest,
  actor: ActorContext,
): Promise<ShiftTemplateRecord> {
  const { scope, audit } = actor;
  const row = await prisma.$transaction(async (tx) => {
    await requireStructureEdit(actor, tx);
    if (patch.idempotencyKey) await lockReserved(tx, scope, patch.idempotencyKey);
    const existing = await findTemplateRow(tx, scope, id);
    if (!existing) throw new NotFoundError('Shift template');
    if (
      (patch.startLocal !== undefined && patch.startLocal !== existing.startLocal) ||
      (patch.endLocal !== undefined && patch.endLocal !== existing.endLocal)
    )
      await requireStructureChange(actor, tx);
    assertTemplateHours({ ...existing, ...patch });
    const { idempotencyKey: _key, ...data } = patch;
    const updated = await updateTemplateRow(tx, scope, { id, data });
    if (patch.startLocal !== undefined || patch.endLocal !== undefined) {
      await moveFollowingShifts(tx, scope, updated);
    }
    await writeAudit(tx, {
      ...audit,
      action: 'shiftTemplate.update',
      entityType: 'ShiftTemplate',
      entityId: id,
      before: {
        label: existing.label,
        startLocal: existing.startLocal,
        endLocal: existing.endLocal,
      },
      after: data,
    });
    if (patch.idempotencyKey)
      await settleReserved(tx, scope, {
        key: patch.idempotencyKey,
        statusCode: 200,
        body: { template: toShiftTemplateRecord(updated) },
      });
    return updated;
  });
  return toShiftTemplateRecord(row);
}
