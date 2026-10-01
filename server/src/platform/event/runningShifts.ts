import { prisma } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { systemClock } from '../time/index.js';

/** Scheduled staffing and attendance retain the shift's actual hours in every phase. */
export function scheduledShifts(scope: EventScope, now: Date) {
  return { eventId: scope.eventId, startsAt: { lte: now }, endsAt: { gt: now } };
}

/** Rehearsal permits the event's rostered shifts on any day, without changing the roster. */
export function shiftFilter(scope: EventScope, mode: { rehearsal: boolean; now: Date }) {
  return mode.rehearsal ? { eventId: scope.eventId } : scheduledShifts(scope, mode.now);
}

/**
 * Which shifts are running at an instant, as a filter on `Shift` (P09.5): the
 * shift's own start and end decide, so a handover overlap, an overnight shift
 * and a DST day all hold. REHEARSAL permits assigned shifts outside their hours
 * and dates. The phase is read on every check so go-live closes that permission.
 */
export async function runningShifts(scope: EventScope, now: Date = systemClock.now()) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { status: true },
  });
  return shiftFilter(scope, { rehearsal: event.status === 'REHEARSAL', now });
}
