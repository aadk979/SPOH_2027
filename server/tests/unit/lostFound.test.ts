import { describe, expect, it } from 'vitest';
import { assertNotClaimed } from '../../src/modules/lostFound/domain/itemRules.js';

/** Lost-and-found rules (P06.6). */

describe('assertNotClaimed', () => {
  it('refuses a second claim', () => {
    expect(() => assertNotClaimed({ status: 'HELD' })).not.toThrow();
    expect(() => assertNotClaimed({ status: 'CLAIMED' })).toThrow(
      expect.objectContaining({ code: 'ITEM_ALREADY_CLAIMED', statusCode: 409 }),
    );
  });
});
