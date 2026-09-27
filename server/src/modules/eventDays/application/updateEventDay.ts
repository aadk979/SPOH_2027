import type { EventDayRecord, UpdateEventDayRequest } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toEventDayRecord } from '../data/mappers.js';
import { findEventDayRow, updateEventDayRow } from '../data/repo.js';

export async function updateEventDay(
  id: string,
  patch: UpdateEventDayRequest,
  audit: AuditContext,
): Promise<EventDayRecord> {
  const existing = await findEventDayRow(id);
  if (!existing) throw new NotFoundError('Event day');

  const row = await prisma.$transaction(async (tx) => {
    const updated = await updateEventDayRow(tx, {
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
    return updated;
  });

  return toEventDayRecord(row);
}
