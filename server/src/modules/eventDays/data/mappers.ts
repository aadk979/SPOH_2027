import type { EventDayRecord } from '@spoh/shared';
import type { EventDayRow } from './repo.js';

/** An event day as the API returns it (it was built three times over in the admin service). */
export function toEventDayRecord(row: EventDayRow): EventDayRecord {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    label: row.label,
    isPublicDay: row.isPublicDay,
    isTourDay: row.isTourDay,
    assignmentCount: row._count.shiftAssignments,
    createdAt: row.createdAt.toISOString(),
  };
}
