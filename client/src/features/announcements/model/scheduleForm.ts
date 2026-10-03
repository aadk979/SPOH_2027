import {
  IsoDate,
  wallTimeToInstant,
  zonedWallTime,
  type AnnouncementPublicationScheduleRecord,
} from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';

export function publicationInstant(wallTime: string, timezone: string): string {
  const [date, time] = wallTime.split('T');
  if (
    wallTime.split('T').length !== 2 ||
    !IsoDate.safeParse(date).success ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')
  )
    throw new Error('Choose a valid publication date and time.');
  return wallTimeToInstant(date!, time!, timezone).toISOString();
}
export const publicationWallTime = (instant: string, timezone: string) =>
  zonedWallTime(new Date(instant), timezone);
export function announcementFormError(error: unknown): string {
  if (error instanceof ApiError && error.status < 500) return error.message;
  return 'Could not save. Check your connection, reload the current status, then try again.';
}
export const scheduleErrorLabels: Record<
  NonNullable<AnnouncementPublicationScheduleRecord['lastError']>,
  string
> = {
  INVALID_PAYLOAD: 'The saved scheduling input is invalid.',
  AUTHORITY_CHANGED: 'The creator no longer has permission.',
  GUARD_FAILED: 'The draft or event changed; review it before scheduling again.',
  TOO_LATE: 'The publication deadline has passed.',
  TARGET_MISSING: 'The draft or audience is no longer available.',
  SYSTEM_ONLY: 'This action cannot be run as a user schedule.',
  HANDLER_UNAVAILABLE: 'Publication is temporarily unavailable.',
  EXECUTION_FAILED: 'Publication could not finish.',
  ATTEMPTS_EXHAUSTED: 'The retry limit was reached.',
};
