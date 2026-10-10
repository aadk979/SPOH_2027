import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { currentSigningKey, sessionSigningKeys } from './sessionKeys.js';
import type { SigningKey } from './signingKeys.js';

export function encryptProviderToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', currentSigningKey.encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${currentSigningKey.id}.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
}

export function decryptProviderToken(encrypted: string): string {
  const [id, encoded] = encrypted.includes('.') ? encrypted.split('.') : [undefined, encrypted];
  for (const key of sessionSigningKeys.filter((candidate) => !id || candidate.id === id)) {
    try { return decryptWithKey(encoded as string, key); } catch { /* An explicit overlap may decrypt a legacy envelope. */ }
  }
  throw new Error('Temporary identity credential cannot be decrypted');
}

function decryptWithKey(encrypted: string, key: SigningKey): string {
  const bytes = Buffer.from(encrypted, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', key.encryptionKey, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}

/** Repeatable only by the API: a concurrent refresh returns the same successor. */
export function successorRefreshToken(sessionId: string): string {
  return successorWithKey(sessionId, currentSigningKey);
}

function successorWithKey(sessionId: string, key: SigningKey): string {
  return createHmac('sha256', key.encryptionKey).update(`refresh-successor:${sessionId}`).digest('base64url');
}

/** A rolling deploy may have created the replacement under the explicit previous key. */
export function matchingSuccessorRefreshToken(sessionId: string, tokenHash: string): string | null {
  return sessionSigningKeys.map((key) => successorWithKey(sessionId, key))
    .find((token) => createHash('sha256').update(token).digest('hex') === tokenHash) ?? null;
}
