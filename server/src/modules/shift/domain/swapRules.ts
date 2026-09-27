import { ERROR_CODES } from '@spoh/shared';
import { AppError, ForbiddenError } from '../../../platform/errors/index.js';

/** Shift swaps (PRODUCT_BRIEF §6): who may ask, and when a swap can still be decided. */

/** You may only give away your own shift; otherwise anyone could reassign anyone (BUILD_PLAN §8.5). */
export function assertOwnShift(assignment: { volunteerId: string }, requesterId: string): void {
  if (assignment.volunteerId !== requesterId) {
    throw new ForbiddenError('You can only request a swap for your own shift');
  }
}

export function assertNotSelf(targetId: string, requesterId: string): void {
  if (targetId === requesterId) {
    throw new AppError(409, ERROR_CODES.CONFLICT, 'You cannot swap a shift with yourself');
  }
}

/** The target must be free in that block, at request and again at approval. */
export function assertTargetFree(busy: boolean, message: string): void {
  if (busy) throw new AppError(409, ERROR_CODES.CONFLICT, message);
}

export function assertSwapPending(swap: { status: string }): void {
  if (swap.status !== 'REQUESTED') {
    throw new AppError(
      409,
      ERROR_CODES.SWAP_NOT_PENDING,
      `This swap has already been ${swap.status.toLowerCase()}`,
    );
  }
}
