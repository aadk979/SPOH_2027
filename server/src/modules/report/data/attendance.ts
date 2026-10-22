import type { ReportReadScope } from './readScope.js';
import type { Range } from './repo.js';

/** A selected operational day names assignments by calendar identity, not UTC midnight. */
export async function volunteerAttendance(
  scope: ReportReadScope,
  range: Range & { eventDayId?: string },
) {
  if (range.from >= range.to) return [];
  return scope.db.shiftAssignment.findMany({
    where: {
      eventId: scope.eventId,
      ...(range.eventDayId
        ? { eventDayId: range.eventDayId }
        : { eventDay: { date: { gte: range.from, lt: range.to } } }),
    },
    select: {
      volunteerId: true,
      stationId: true,
      checkedInAt: true,
      checkedOutAt: true,
      station: { select: { name: true } },
      shift: { select: { endsAt: true } },
    },
  });
}
