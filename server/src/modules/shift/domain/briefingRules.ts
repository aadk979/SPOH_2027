import { ERROR_CODES, roleMeets, type CommitteeRole } from '@spoh/shared';
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
 * The briefer marks their own slot done. An IC or above can too — someone has
 * to be able to tidy up after a briefer whose phone died mid-wave. Nobody else
 * can, whether or not the slot has a briefer: the rule was inverted, letting
 * anyone complete an unassigned wave and stopping an IC (F03-016).
 */
export function assertMayComplete(
  slot: { briefierId: string | null },
  actor: { volunteerId: string; role: CommitteeRole },
): void {
  if (slot.briefierId === actor.volunteerId || roleMeets(actor.role, 'IC')) return;
  throw new ForbiddenError('Only the assigned briefer or an IC can complete this slot');
}
