import { ValidationError } from '../../../platform/errors/index.js';

/**
 * A template's hours must make a shift: it ends after it starts on the same
 * day, unless it is one that runs past midnight (ADR-002).
 */
export function assertTemplateHours(hours: {
  startLocal: string;
  endLocal: string;
  endsNextDay: boolean;
}): void {
  if (!hours.endsNextDay && hours.endLocal <= hours.startLocal) {
    throw new ValidationError('A shift must end after it starts', [
      { path: 'endLocal', message: 'must be after the start time' },
    ]);
  }
}
