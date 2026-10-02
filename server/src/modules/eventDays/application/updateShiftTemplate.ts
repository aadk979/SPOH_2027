import type { ShiftTemplateRecord, UpdateShiftTemplateRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
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
  { scope, audit }: ActorContext,
): Promise<ShiftTemplateRecord> {
  const row = await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, scope);
    const existing = await findTemplateRow(tx, scope, id);
    if (!existing) throw new NotFoundError('Shift template');
    assertTemplateHours({ ...existing, ...patch });
    const updated = await updateTemplateRow(tx, scope, { id, data: patch });
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
      after: { ...patch },
    });
    return updated;
  });
  return toShiftTemplateRecord(row);
}
