import { z } from 'zod';
import { Id, VoidRegistrationRequest } from '@spoh/shared';
import { eventWallTimeInstant } from '@/shared/lib/eventWallTime';

export const VoidRecordFields = VoidRegistrationRequest.extend({
  kind: z.enum(['registration', 'footfall']),
  recordId: Id,
});

/** A correction belongs to the event's wall clock, including its DST rules. */
export function correctionInstant(wallTime: string, timezone: string): string {
  return eventWallTimeInstant(wallTime, timezone);
}
