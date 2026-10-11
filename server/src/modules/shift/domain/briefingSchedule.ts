import { zonedDate, type CreateBriefingSlotRequest, type EventStatus } from '@spoh/shared';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';

export function assertBriefingSchedule(
  request: CreateBriefingSlotRequest,
  context: {
    day: { date: Date } | null;
    event: { timezone: string; status: EventStatus };
    member: { status: string } | null;
    startsAt: Date;
  },
): void {
  if (!context.day) throw new NotFoundError('Event day');
  if (context.event.status === 'ARCHIVED')
    throw new ValidationError('Archived events are read only.');
  if (request.briefierId && context.member?.status !== 'ACTIVE')
    throw new NotFoundError('Active briefer');
  if (
    zonedDate(context.startsAt, context.event.timezone) !==
    context.day.date.toISOString().slice(0, 10)
  ) {
    throw new ValidationError('Choose a briefing time on the selected event day.');
  }
}
