import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * A voided registration stays voided: voiding keeps the row and excludes it
 * from every count, and voiding it twice would record a correction of nothing.
 */
export function assertNotVoided(registration: { voided: boolean }): void {
  if (registration.voided) {
    throw new AppError(409, ERROR_CODES.ALREADY_VOIDED, 'This registration is already voided');
  }
}
