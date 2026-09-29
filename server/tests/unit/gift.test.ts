import { describe, expect, it } from 'vitest';
import {
  assertInStock,
  checkPresentedCard,
  stockFlag,
} from '../../src/modules/gift/domain/redemptionRules.js';

/** Gift redemption rules (P06.5): the only hard stop is running out. */

const card = (status: string) => ({ id: 'c1', status });

describe('assertInStock', () => {
  it('refuses only when nothing is left', () => {
    expect(() => assertInStock({ name: 'Tote' }, 1)).not.toThrow();
    expect(() => assertInStock({ name: 'Tote' }, 0)).toThrow(
      expect.objectContaining({ code: 'GIFT_OUT_OF_STOCK', statusCode: 409 }),
    );
  });
});

describe('stockFlag (ADR-007 §5, F03-034)', () => {
  it('flags a queued redemption past the stock instead of refusing it', () => {
    expect(stockFlag({ name: 'Tote' }, 1, true)).toBeNull();
    expect(stockFlag({ name: 'Tote' }, 0, true)).toBe('OVER_STOCK');
    expect(stockFlag({ name: 'Tote' }, -2, true)).toBe('OVER_STOCK');
  });

  it('still refuses online', () => {
    expect(stockFlag({ name: 'Tote' }, 1, false)).toBeNull();
    expect(() => stockFlag({ name: 'Tote' }, 0, false)).toThrow(
      expect.objectContaining({ code: 'GIFT_OUT_OF_STOCK' }),
    );
  });
});

describe('checkPresentedCard', () => {
  const base = { alreadyRedeemed: false, acknowledged: false };

  it.each([
    [
      'an unknown code',
      null,
      null,
      null,
      'That card code was not found. The gift was still recorded.',
    ],
    [
      'a voided card',
      card('VOIDED'),
      'c1',
      null,
      'That card has been voided. Check with your IC before handing over a gift.',
    ],
    ['a completed card', card('COMPLETED'), 'c1', true, null],
    [
      'an incomplete card',
      card('ISSUED'),
      'c1',
      false,
      'This card is not yet complete. Verify the stamps.',
    ],
  ])('%s', (_label, presented, missionCardId, cardComplete, warning) => {
    expect(checkPresentedCard({ ...base, card: presented })).toEqual({
      missionCardId,
      cardComplete,
      warning,
      secondGift: false,
    });
  });

  it('refuses a second gift until the volunteer confirms', () => {
    expect(() =>
      checkPresentedCard({ card: card('COMPLETED'), alreadyRedeemed: true, acknowledged: false }),
    ).toThrow(expect.objectContaining({ code: 'GIFT_ALREADY_REDEEMED' }));

    expect(
      checkPresentedCard({ card: card('COMPLETED'), alreadyRedeemed: true, acknowledged: true })
        .warning,
    ).toBe('Second gift redeemed against this card, confirmed by the volunteer.');
    expect(
      checkPresentedCard({ card: card('COMPLETED'), alreadyRedeemed: true, acknowledged: true })
        .secondGift,
    ).toBe(true);
  });
});
