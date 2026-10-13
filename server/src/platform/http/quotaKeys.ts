import { createHash } from 'node:crypto';
import type { CounterSpec, QuotaNamespace } from './quotaCounterRepo.js';

export const quotaDigest = (input: unknown): string =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');

/** Only opaque digests enter the store and draft-8 rate-limit partition headers. */
export function quotaKey(input: { namespace: QuotaNamespace; scope: unknown; subject: string; windowSeconds: number }): string {
  return JSON.stringify([input.namespace, quotaDigest(input.scope), quotaDigest(input.subject), input.windowSeconds]);
}

export function parseQuotaKey(key: string, namespace: QuotaNamespace): CounterSpec {
  const value: unknown = JSON.parse(key);
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Invalid internal quota key');
  const [actual, scopeDigest, subjectDigest, windowSeconds] = value;
  if (actual !== namespace || !isDigest(scopeDigest) || !isDigest(subjectDigest) || !isWindow(windowSeconds))
    throw new Error('Invalid internal quota key');
  return { namespace, scopeDigest, subjectDigest, windowSeconds };
}

const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isWindow = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 600;

/** Prisma BigInt is capped only at the HTTP number boundary, retaining fail-closed admission. */
export function counterNumber(value: bigint): number {
  return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
}
