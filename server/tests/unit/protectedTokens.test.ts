import { describe, expect, it } from 'vitest';
import { encryptProviderToken, decryptProviderToken, successorRefreshToken } from '../../src/platform/identity/protectedTokens.js';

describe('short-lived provider token encryption', () => {
  it('round-trips without storing the provider credential in clear text', () => {
    const token = 'temporary-provider-credential';
    const first = encryptProviderToken(token);
    const second = encryptProviderToken(token);
    expect(first).not.toContain(token);
    expect(first).not.toBe(second);
    expect(decryptProviderToken(first)).toBe(token);
  });
  it('rejects tampering, and derives a stable distinct successor for each row', () => {
    const bytes = Buffer.from(encryptProviderToken('secret'), 'base64url');
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    expect(() => decryptProviderToken(bytes.toString('base64url'))).toThrow();
    expect(successorRefreshToken('a')).toBe(successorRefreshToken('a'));
    expect(successorRefreshToken('a')).not.toBe(successorRefreshToken('b'));
  });
});
