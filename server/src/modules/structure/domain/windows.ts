import { nextDate, wallTimeToInstant, ShiftHours, type EventStatus } from '@spoh/shared';
import { ValidationError } from '../../../platform/errors/index.js';

export function structureWritable(status: EventStatus): boolean {
  return status !== 'ARCHIVED';
}
export function structureCreatable(status: EventStatus): boolean {
  return status === 'DRAFT' || status === 'READY' || status === 'REHEARSAL';
}
export function validateShiftHours(hours: {
  startLocal: string;
  endLocal: string;
  endsNextDay: boolean;
}): void {
  const valid = ShiftHours.safeParse({
    startLocal: hours.startLocal,
    endLocal: hours.endLocal,
    endsNextDay: hours.endsNextDay,
  });
  if (!valid.success) throw new ValidationError(valid.error.issues[0]?.message);
}
export function templateWindow(input: {
  date: string;
  timezone: string;
  hours: { startLocal: string; endLocal: string; endsNextDay: boolean };
}) {
  validateShiftHours(input.hours);
  const startsAt = wallTimeToInstant(input.date, input.hours.startLocal, input.timezone);
  const endsAt = wallTimeToInstant(
    input.hours.endsNextDay ? nextDate(input.date) : input.date,
    input.hours.endLocal,
    input.timezone,
  );
  if (endsAt <= startsAt)
    throw new ValidationError('The event timezone makes this shift empty; choose different hours.');
  return { startsAt, endsAt };
}
