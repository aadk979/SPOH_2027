import { zonedDate, zonedWallTime, type ShiftExceptionRecord } from '@spoh/shared';
import type { findShift } from './templateRepo.js';

type ShiftRow = NonNullable<Awaited<ReturnType<typeof findShift>>>;
export function toShiftException(row: ShiftRow, timezone: string): ShiftExceptionRecord {
  return {
    id: row.id,
    eventDayId: row.eventDayId,
    templateId: row.templateId,
    date: row.eventDay.date.toISOString().slice(0, 10),
    dayLabel: row.eventDay.label,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    overridden: row.overridden,
    startLocal: zonedWallTime(row.startsAt, timezone).slice(11),
    endLocal: zonedWallTime(row.endsAt, timezone).slice(11),
    endsNextDay: zonedDate(row.endsAt, timezone) > zonedDate(row.startsAt, timezone),
  };
}
export function toCategoryRecord<Row extends { updatedAt: Date }>(row: Row) {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}
