import { createHash } from 'node:crypto';
import { decodeProtectedHeader } from 'jose';

export interface SigningKey {
  readonly id: string;
  readonly bytes: Uint8Array;
  readonly encryptionKey: Buffer;
}

/** At most two keys: first deploy overlap, then switch writers, then retire the old key. */
export function createSigningKeys(current: string, previous?: string): readonly SigningKey[] {
  return [...new Set([current, previous].filter((value): value is string => value !== undefined))]
    .map((value) => ({
      id: createHash('sha256').update(value).digest('hex').slice(0, 16),
      bytes: new TextEncoder().encode(value),
      encryptionKey: createHash('sha256').update(value).digest(),
    }));
}

/** Old deployments issued no kid; accept those only against the explicit overlap ring. */
export function verificationKeys(token: string, keys: readonly SigningKey[]): readonly SigningKey[] {
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'HS256') return [];
    if (header.kid === undefined) return keys;
    return keys.filter((key) => key.id === header.kid);
  } catch {
    return [];
  }
}
