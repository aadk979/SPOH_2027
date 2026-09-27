import { ERROR_CODES } from '@spoh/shared';
import { AppError, ForbiddenError } from '../../../platform/errors/index.js';

export function assertSlotOpen(slot: { completedAt: Date | null }): void {
  if (slot.completedAt) {
    throw new AppError(
      409,
      ERROR_CODES.SLOT_ALREADY_COMPLETED,
      'That briefing slot is already marked complete',
    );
  }
}

/**
 * The briefer marks their own slot done. An IC can too — someone has to be
 * able to tidy up after a briefer whose phone died mid-wave.
 */
export function assertMayComplete(slot: { briefierId: string | null }, actorId: string): void {
  if (slot.briefierId && slot.briefierId !== actorId) {
    throw new ForbiddenError('Only the assigned briefer or an IC can complete this slot');
  }
}
