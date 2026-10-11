import { z } from 'zod';
import { wallTimeToInstant } from '@spoh/shared';

/** Validate the local input before applying the shared event-clock DST rules. */
export function eventWallTimeInstant(wallTime: string, timezone: string): string {
  const [date, time, extra] = wallTime.split('T');
  if (extra !== undefined || !z.iso.date().safeParse(date).success || !/^\d{2}:\d{2}$/.test(time ?? '')) {
    throw new Error('Choose a valid date and time on the event clock.');
  }
  const [hour, minute] = time!.split(':').map(Number);
  if (hour! > 23 || minute! > 59)
    throw new Error('Choose a valid date and time on the event clock.');
  return wallTimeToInstant(date!, time!, timezone).toISOString();
}
