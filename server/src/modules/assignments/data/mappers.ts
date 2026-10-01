import type { ShiftAssignmentRecord } from '@spoh/shared';
import { toShiftRef } from '../../../platform/db/shiftRef.js';
import type { AssignmentWithNames } from './repo.js';

export function toAssignmentRecord(row: AssignmentWithNames): ShiftAssignmentRecord {
  return {
    id: row.id,
    volunteerId: row.volunteerId,
    volunteerName: row.volunteer.displayName,
    volunteerPhone: row.volunteer.phone,
    stationId: row.stationId,
    stationName: row.station.name,
    eventDayId: row.eventDayId,
    date: row.eventDay.date.toISOString().slice(0, 10),
    shift: toShiftRef(row.shift),
    roleLabel: row.roleLabel,
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    checkedOutAt: row.checkedOutAt?.toISOString() ?? null,
  };
}
