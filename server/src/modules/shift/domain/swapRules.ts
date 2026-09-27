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

/**
 * The shift must still belong to the person who asked to give it away. Once
 * one of their requests is approved, their other requests for the same shift
 * would hand someone else's shift away (F03-005).
 */
export function assertStillRequesters(swap: {
  requesterId: string;
  assignment: { volunteerId: string };
}): void {
  if (swap.assignment.volunteerId !== swap.requesterId) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      'That shift has since moved to someone else. This swap can no longer be approved.',
    );
  }
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
