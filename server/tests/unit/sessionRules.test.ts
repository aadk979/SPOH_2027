import { describe, expect, it } from 'vitest';
import { refreshExpiry, rotationCheck } from '../../src/modules/auth/domain/sessionRules.js';

/** Session rotation rules (P06.7), without a database. */

const now = new Date('2027-01-07T03:30:00.000Z');
const live = {
  revokedAt: null,
  expiresAt: new Date(now.getTime() + 60_000),
};

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('session rules', () => {
  it('rotates a live session', () => {
    expect(rotationCheck(live, now)).toBe('ok');
  });

  it('reports a rotated token presented again as reuse, before any other check', () => {
    const rotated = { ...live, revokedAt: now, expiresAt: now };
    expect(rotationCheck(rotated, now)).toBe('reused');
  });

  // An inactive account is refused when the person is loaded for the new
  // token: standing is the home membership's (P09.10).
  it('ends an expired session', () => {
    expect(codeOf(() => rotationCheck({ ...live, expiresAt: now }, now))).toBe('SESSION_EXPIRED');
  });

  it('expires a refresh session the configured number of days out', () => {
    expect(refreshExpiry(now, 30).toISOString()).toBe('2027-02-06T03:30:00.000Z');
  });
});
