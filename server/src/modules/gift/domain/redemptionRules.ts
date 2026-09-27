import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * Gift redemption (PRODUCT_BRIEF §5). The physical stamped card is what
 * authorises a gift. The scan is a cross-check, never a gate — a card that
 * will not scan must never stop a visitor who has walked the whole journey. So
 * every soft failure is a warning the volunteer can acknowledge, and only
 * genuinely running out of stock is a hard stop.
 */

/**
 * The one hard stop. Out of stock renders a clear domain error rather than a
 * silent failure or a 500, so the desk sees "we have run out" (§5).
 */
export function assertInStock(gift: { name: string }, remaining: number): void {
  if (remaining <= 0) {
    throw new AppError(
      409,
      ERROR_CODES.GIFT_OUT_OF_STOCK,
      `${gift.name} is out of stock. Tell your IC and offer an alternative.`,
    );
  }
}

export interface CardCheck {
  missionCardId: string | null;
  cardComplete: boolean | null;
  warning: string | null;
}

/**
 * What the card presented at the desk says about this gift. A second gift
 * against one card is refused until the volunteer confirms they checked the
 * physical card.
 */
export function checkPresentedCard(presented: {
  card: { id: string; status: string } | null;
  alreadyRedeemed: boolean;
  acknowledged: boolean;
}): CardCheck {
  const { card } = presented;
  if (!card) {
    // The physical card is authoritative; a code that does not resolve loses
    // the journey link and nothing else.
    return {
      missionCardId: null,
      cardComplete: null,
      warning: 'That card code was not found. The gift was still recorded.',
    };
  }
  if (card.status === 'VOIDED' || card.status === 'LOST') {
    return {
      missionCardId: card.id,
      cardComplete: null,
      warning: 'That card has been voided. Check with your IC before handing over a gift.',
    };
  }
  if (presented.alreadyRedeemed && !presented.acknowledged) {
    throw new AppError(
      409,
      ERROR_CODES.GIFT_ALREADY_REDEEMED,
      'A gift has already been redeemed against this card. Check the physical card, then confirm to proceed.',
    );
  }
  const cardComplete = card.status === 'COMPLETED';
  const warning = presented.alreadyRedeemed
    ? 'Second gift redeemed against this card, confirmed by the volunteer.'
    : cardComplete
      ? null
      : 'This card is not yet complete. Verify the stamps.';
  return { missionCardId: card.id, cardComplete, warning };
}
