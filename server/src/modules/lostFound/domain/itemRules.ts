import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * Lost and found (PRODUCT_BRIEF §7.2). Slide 48 tracks lost-and-found cases as
 * a metric; this is the first time the event has the number rather than
 * somebody's recollection.
 */
export function assertNotClaimed(item: { status: string }): void {
  if (item.status === 'CLAIMED') {
    throw new AppError(409, ERROR_CODES.ITEM_ALREADY_CLAIMED, 'That item has already been claimed');
  }
}
