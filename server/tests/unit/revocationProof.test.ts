import { CompactSign, SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issueAccessToken, verifyAccessToken, verifyRevocationProof } from '../../src/platform/identity/sessionTokens.js';

const signing = vi.hoisted(() => {
  const current = { id: 'current-test-key', bytes: new TextEncoder().encode('current-synthetic-secret-for-revocation-tests'), encryptionKey: Buffer.alloc(32) };
  const previous = { id: 'previous-test-key', bytes: new TextEncoder().encode('previous-synthetic-secret-for-revocation-tests'), encryptionKey: Buffer.alloc(32) };
  return { current, previous, keys: [current, previous] };
});
vi.mock('../../src/platform/identity/sessionKeys.js', () => ({
  currentSigningKey: signing.current,
  sessionSigningKeys: signing.keys,
}));

const claims = { sub: 'synthetic-person', sid: 'synthetic-session' };
const payload = { ...claims, iss: 'spoh2027-api', aud: 'spoh2027-api', exp: 1 };
beforeEach(() => signing.keys.splice(0, signing.keys.length, signing.current, signing.previous));

async function proof(body: Record<string, unknown> = payload) {
  return new SignJWT(body).setProtectedHeader({ alg: 'HS256', kid: signing.current.id }).sign(signing.current.bytes);
}

describe('revocation-only session proof', () => {
  it('accepts an expired thin proof for revocation while ordinary authentication rejects it', async () => {
    const expired = await issueAccessToken(claims, -1);
    expect(await verifyRevocationProof(expired.token)).toEqual(claims);
    expect(await verifyAccessToken(expired.token)).toBeNull();
    const live = await issueAccessToken(claims, 60);
    expect(await verifyAccessToken(live.token)).toEqual(claims);
  });

  it('accepts the explicit previous key only until it is retired, including legacy kid-less proofs', async () => {
    const old = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256', kid: signing.previous.id }).sign(signing.previous.bytes);
    const legacy = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(signing.previous.bytes);
    expect(await verifyRevocationProof(old)).toEqual(claims);
    expect(await verifyRevocationProof(legacy)).toEqual(claims);
    signing.keys.splice(1);
    expect(await verifyRevocationProof(old)).toBeNull();
    expect(await verifyRevocationProof(legacy)).toBeNull();
    expect(await verifyRevocationProof(await proof())).toEqual(claims);
  });

  it('rejects altered signatures, unknown key ids and other algorithms', async () => {
    const token = await proof();
    const unknown = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256', kid: 'unconfigured' }).sign(signing.current.bytes);
    const otherAlgorithm = await new SignJWT(payload).setProtectedHeader({ alg: 'HS384' }).sign(signing.current.bytes);
    expect(await verifyRevocationProof(`${token.slice(0, -5)}aaaaa`)).toBeNull();
    expect(await verifyRevocationProof(unknown)).toBeNull();
    expect(await verifyRevocationProof(otherAlgorithm)).toBeNull();
    expect(await verifyRevocationProof('invalid')).toBeNull();
  });

  it.each([
    { ...payload, iss: 'another-issuer' },
    { ...payload, aud: 'another-audience' },
    { ...payload, sub: null },
    { ...payload, sid: null },
  ])('rejects a signed proof with an invalid claim: %j', async (body) => {
    expect(await verifyRevocationProof(await proof(body))).toBeNull();
  });

  it('rejects a signed payload that is not a JSON object', async () => {
    for (const body of ['not-json', 'null', '42']) {
      const token = await new CompactSign(new TextEncoder().encode(body))
        .setProtectedHeader({ alg: 'HS256', kid: signing.current.id }).sign(signing.current.bytes);
      expect(await verifyRevocationProof(token)).toBeNull();
    }
  });
});
