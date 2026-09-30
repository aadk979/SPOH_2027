import { zonedOffset, type FullReport } from '@spoh/shared';
import { localHourLabel } from '../../../platform/time/index.js';

/**
 * Hourly rows labelled on the event's wall clock. On the day clocks go back
 * the repeated hour is two real hours, so it stays two rows, and those two
 * labels carry their UTC offset ("2027-10-31 01:00 +01:00", "… +00:00") to be
 * told apart (F01 time audit, case 4). Every other label is the plain hour.
 */
export function hourlyRows(
  rows: ReadonlyArray<{ hour: Date; value: number }>,
  timezone: string,
): FullReport['registrations']['byHour'] {
  const labels = rows.map((row) => localHourLabel(row.hour, timezone));
  const seen = new Map<string, number>();
  for (const label of labels) seen.set(label, (seen.get(label) ?? 0) + 1);

  return rows.map((row, index) => {
    const label = labels[index] ?? '';
    const repeated = (seen.get(label) ?? 0) > 1;
    return {
      hour: row.hour.toISOString(),
      localHour: repeated ? `${label} ${zonedOffset(row.hour, timezone)}` : label,
      value: row.value,
    };
  });
}
