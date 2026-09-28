import type { MyAssignment } from '@spoh/shared';
import { toStationSummary } from '../../station/index.js';
import type { AssignmentWithContext } from './repo.js';

export function toMyAssignment(assignment: AssignmentWithContext): MyAssignment {
  return {
    id: assignment.id,
    eventDayId: assignment.eventDayId,
    date: assignment.eventDay.date.toISOString().slice(0, 10),
    dayLabel: assignment.eventDay.label,
    block: assignment.block,
    roleLabel: assignment.roleLabel,
    station: toStationSummary(assignment.station),
    checkedInAt: assignment.checkedInAt?.toISOString() ?? null,
    checkedOutAt: assignment.checkedOutAt?.toISOString() ?? null,
  };
}
