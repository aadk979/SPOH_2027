import type { EventDayRecord, ShiftAssignmentRecord, StationSummary } from '@spoh/shared';

export const selectedStaffingDay = (days: EventDayRecord[], dayId: string) =>
  days.find((day) => day.id === dayId) ?? days[0];

export function assignmentCells(input: {
  day: EventDayRecord;
  stations: StationSummary[];
  assignments: ShiftAssignmentRecord[];
}) {
  return input.day.shifts.flatMap((shift) =>
    input.stations.map((station) => ({
      shift,
      station,
      assignments: input.assignments.filter(
        (assignment) => assignment.shift.id === shift.id && assignment.stationId === station.id,
      ),
    })),
  );
}
