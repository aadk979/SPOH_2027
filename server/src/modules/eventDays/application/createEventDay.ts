import { ERROR_CODES, type CreateEventDayRequest, type EventDayRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { eventDayAnchor } from '../../../platform/time/index.js';
import { toEventDayRecord } from '../data/mappers.js';
import { createEventDayRow, findEventDayByDate } from '../data/repo.js';

export async function createEventDay(
  request: CreateEventDayRequest,
  audit: AuditContext,
): Promise<EventDayRecord> {
  const date = eventDayAnchor(request.date);
  const existing = await findEventDayByDate(date);
  if (existing) {
    throw new ConflictError(
      ERROR_CODES.EVENT_DAY_EXISTS,
      `${request.date} is already configured as "${existing.label}"`,
    );
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await createEventDayRow(tx, {
      date,
      label: request.label,
      isPublicDay: request.isPublicDay,
      isTourDay: request.isTourDay,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'eventDay.create',
      entityType: 'EventDay',
      entityId: created.id,
      after: { date: request.date, label: request.label },
    });
    return created;
  });

  return toEventDayRecord(row);
}
