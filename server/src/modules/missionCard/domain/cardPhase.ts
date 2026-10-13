import { ERROR_CODES, type EventStatus } from '@spoh/shared';
import { ConflictError } from '../../../platform/errors/index.js';

export function assertCardWritePhase(status: EventStatus): void {
  if (status === 'ARCHIVED')
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived mission cards are read-only.');
}
