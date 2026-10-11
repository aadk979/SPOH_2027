import type { EventDayRecord, UpdateEventDayRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { requireStructureEdit } from '../../structure/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toEventDayRecord } from '../data/mappers.js';
import { findEventDayRow, updateEventDayRow } from '../data/repo.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';

export async function updateEventDay(
  id: string,
  patch: UpdateEventDayRequest,
  actor: ActorContext,
): Promise<EventDayRecord> {
  const { scope, audit } = actor;

  const row = await prisma.$transaction(async (tx) => {
    await requireStructureEdit(actor, tx);
    const existing = await findEventDayRow(scope, id, tx);
    if (!existing) throw new NotFoundError('Event day');
    if (patch.idempotencyKey) await lockReserved(tx, scope, patch.idempotencyKey);
    const updated = await updateEventDayRow(tx, scope, {
      id,
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.isPublicDay !== undefined ? { isPublicDay: patch.isPublicDay } : {}),
        ...(patch.isTourDay !== undefined ? { isTourDay: patch.isTourDay } : {}),
      },
    });
    await writeAudit(tx, {
      ...audit,
      action: 'eventDay.update',
      entityType: 'EventDay',
      entityId: id,
      before: { label: existing.label },
      after: { ...patch },
    });
    if (patch.idempotencyKey)
      await settleReserved(tx, scope, {
        key: patch.idempotencyKey,
        statusCode: 200,
        body: { eventDay: toEventDayRecord(updated) },
      });
    return updated;
  });

  return toEventDayRecord(row);
}
