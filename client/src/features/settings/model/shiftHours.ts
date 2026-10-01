/** A shift template's hours as the settings screen edits them. */
export interface ShiftHoursValue {
  start: string;
  end: string;
}

/**
 * Why these hours cannot be saved, or undefined. The server refuses the same
 * (ADR-002): a shift ends after it starts, unless it runs past midnight.
 */
export function shiftHoursError(hours: ShiftHoursValue, endsNextDay: boolean): string | undefined {
  if (!hours.start || !hours.end) return 'Enter both times';
  if (!endsNextDay && hours.end <= hours.start) return 'A shift must end after it starts';
  return undefined;
}
