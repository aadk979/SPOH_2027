import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createSigningKeys, verificationKeys } from '../../src/platform/identity/signingKeys.js';

const previous = 'previous-synthetic-key-at-least-thirty-two-characters';
const current = 'current-synthetic-key-at-least-thirty-two-characters';
async function accepts(token: string, ring: ReturnType<typeof createSigningKeys>) {
  for (const key of verificationKeys(token, ring)) {
    try { await jwtVerify(token, key.bytes, { algorithms: ['HS256'] }); return true; }
    catch { /* Another explicitly configured key may verify a legacy token. */ }
  }
  return false;
}
describe('session signing key overlap', () => {
  it('verifies both deployed keys during overlap and retires only the old writer', async () => {
    const ring = createSigningKeys(current, previous);
    const old = await new SignJWT({ sid: 'old' }).setProtectedHeader({ alg: 'HS256', kid: ring[1]!.id }).sign(ring[1]!.bytes);
    const next = await new SignJWT({ sid: 'new' }).setProtectedHeader({ alg: 'HS256', kid: ring[0]!.id }).sign(ring[0]!.bytes);
    expect(await accepts(old, ring)).toBe(true);
    expect(await accepts(next, ring)).toBe(true);
    expect(await accepts(old, createSigningKeys(current))).toBe(false);
    expect(await accepts(next, createSigningKeys(current))).toBe(true);
  });
  it('accepts existing kid-less tokens only during the explicit overlap', async () => {
    const ring = createSigningKeys(current, previous);
    const old = await new SignJWT({ sid: 'legacy' }).setProtectedHeader({ alg: 'HS256' }).sign(ring[1]!.bytes);
    expect(await accepts(old, ring)).toBe(true);
    expect(await accepts(old, createSigningKeys(current))).toBe(false);
  });
  it('rejects unknown key ids, algorithm confusion and altered signatures', async () => {
    const ring = createSigningKeys(current, previous);
    const unknown = await new SignJWT({ sid: 'x' }).setProtectedHeader({ alg: 'HS256', kid: 'unconfigured' }).sign(ring[0]!.bytes);
    const wrongAlgorithm = await new SignJWT({ sid: 'x' }).setProtectedHeader({ alg: 'HS384' }).sign(ring[0]!.bytes);
    expect(verificationKeys(unknown, ring)).toEqual([]);
    expect(verificationKeys(wrongAlgorithm, ring)).toEqual([]);
    expect(verificationKeys('invalid', ring)).toEqual([]);
    const token = await new SignJWT({ sid: 'x' }).setProtectedHeader({ alg: 'HS256' }).sign(ring[0]!.bytes);
    expect(await accepts(`${token.slice(0, -5)}aaaaa`, ring)).toBe(false);
    expect(decodeProtectedHeader(token)).not.toHaveProperty('kid');
  });
  it('deduplicates accidental equal overlap keys without exposing the value as its id', () => {
    const ring = createSigningKeys(current, current);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.id).not.toContain(current);
    expect(ring[0]!.encryptionKey).toHaveLength(32);
  });
});
