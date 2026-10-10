import { ERROR_CODES, type EventStatus } from '@spoh/shared';
import { ConflictError } from '../errors/index.js';

/** Call only after holding the Event row and checking the caller's current authority. */
export function assertWritableEvent(event: { status: EventStatus }): void {
  if (event.status === 'ARCHIVED')
    throw new ConflictError(ERROR_CODES.SETTING_LOCKED, 'Archived events are read-only.');
}
