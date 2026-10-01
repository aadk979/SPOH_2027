import { ERROR_CODES, type CardStatus } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * COUNT 3 — Mission Cards (PRODUCT_BRIEF §4). The physical card is not
 * replaced: this module mirrors it. At redemption the physical stamps are
 * still verified visually and the scan is a cross-check, never a gate.
 *
 * The rules below are pure: they read the card and station they are given.
 */

/** The card, or a 404 that says which card was not found. */
export function requireCard<T>(card: T | null, message = 'No card with that code'): T {
  if (!card) throw new AppError(404, ERROR_CODES.CARD_NOT_FOUND, message);
  return card;
}

/** A voided card, or an original replaced after it was lost, is out of use. */
export function isOutOfUse(status: CardStatus): boolean {
  return status === 'VOIDED' || status === 'LOST';
}

export function assertCardNotVoided(card: { status: CardStatus }, message: string): void {
  if (isOutOfUse(card.status)) throw new AppError(409, ERROR_CODES.CARD_VOIDED, message);
}

/** Practice and live cards are distinct journeys even when their physical designs match. */
export function assertCardProvenance(
  card: { rehearsal: boolean },
  provenance: { rehearsal: boolean },
): void {
  if (card.rehearsal === provenance.rehearsal) return;
  const message = card.rehearsal
    ? 'A rehearsal card cannot be used in live operations.'
    : 'A live card cannot be used in rehearsal. Use a rehearsal batch.';
  throw new AppError(409, ERROR_CODES.CONFLICT, message);
}

export function assertStationStamps(station: { name: string; issuesStamp: boolean }): void {
  if (!station.issuesStamp) {
    throw new AppError(
      409,
      ERROR_CODES.STATION_DOES_NOT_STAMP,
      `${station.name} does not stamp Mission Cards.`,
    );
  }
}

export function assertDifferentCards(originalCode: string, replacementCode: string): void {
  if (originalCode === replacementCode) {
    throw new AppError(409, ERROR_CODES.CONFLICT, 'The replacement must be a different card.');
  }
}

/**
 * Only a card on a journey can be reissued: ISSUED or COMPLETED. A voided
 * card's stamps belong to nobody, and an unissued card has none (F03-027).
 */
export function assertReissuable(original: { status: CardStatus }): void {
  if (isOutOfUse(original.status)) {
    throw new AppError(
      409,
      ERROR_CODES.CARD_VOIDED,
      'That card has been voided and cannot be reissued.',
    );
  }
  if (original.status === 'UNISSUED') {
    throw new AppError(
      409,
      ERROR_CODES.CARD_NOT_ISSUED,
      'That card was never issued, so there is no journey to carry over.',
    );
  }
}

/** A replacement must be a fresh card: one already issued belongs to someone. */
export function assertReplacementUnissued(replacement: { status: CardStatus }): void {
  if (replacement.status !== 'UNISSUED') {
    throw new AppError(
      409,
      ERROR_CODES.CARD_ALREADY_ISSUED,
      'That replacement card has already been issued. Take a fresh one.',
    );
  }
}

/** A card is complete when it has been stamped at every stamping station. */
export function isJourneyComplete(stampCount: number, stampingStationCount: number): boolean {
  return stampingStationCount > 0 && stampCount >= stampingStationCount;
}

/** A replacement carries the journey, so a completed original gives a completed replacement. */
export function replacementStatus(originalStatus: CardStatus): 'COMPLETED' | 'ISSUED' {
  return originalStatus === 'COMPLETED' ? 'COMPLETED' : 'ISSUED';
}
