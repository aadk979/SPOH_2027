import { ERROR_CODES } from '@spoh/shared';
import { ConflictError } from '../../../platform/errors/index.js';

/**
 * Deleting an assignment somebody worked would erase the attendance record the
 * post-event report counts. Correct the roster; do not rewrite history.
 */
export function assertNotWorked(assignment: { checkedInAt: Date | null }): void {
  if (assignment.checkedInAt) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'That volunteer has already checked in for this shift. Check them out instead of removing it.',
    );
  }
}
