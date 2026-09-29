import { ERROR_CODES, type CreateEventDayRequest, type EventDayRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventDayAnchor } from '../../../platform/time/index.js';
import { toEventDayRecord } from '../data/mappers.js';
import { createEventDayRow, findEventDayByDate } from '../data/repo.js';
import { addShiftsForDay } from './addShiftsForDay.js';

/** A new day of the event, with a shift per template (P09.5). */
export async function createEventDay(
  request: CreateEventDayRequest,
  { scope, audit }: ActorContext,
): Promise<EventDayRecord> {
  const date = eventDayAnchor(request.date);
  const existing = await findEventDayByDate(scope, date);
  if (existing) {
    throw new ConflictError(
      ERROR_CODES.EVENT_DAY_EXISTS,
      `${request.date} is already configured as "${existing.label}"`,
    );
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await createEventDayRow(tx, scope, {
      date,
      label: request.label,
      isPublicDay: request.isPublicDay,
      isTourDay: request.isTourDay,
    });
    await addShiftsForDay(tx, scope, { id: created.id, date: request.date });
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
