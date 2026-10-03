import type { AnnouncementPushDeliveryError } from '@spoh/shared';

export type DeliveryOutcome =
  | { status: 'SENT'; lastError: null }
  | { status: 'SKIPPED' | 'DEAD'; lastError: AnnouncementPushDeliveryError }
  | { status: 'PENDING'; lastError: 'PUSH_FAILED'; runAt: Date };

export function pushDeliveryOutcome(
  result: 'ACCEPTED' | 'UNCONFIGURED' | 'GONE' | 'FAILED',
  input: { now: Date; expiresAt: Date; attempts: number; maxAttempts: number },
): DeliveryOutcome {
  if (result === 'ACCEPTED') return { status: 'SENT', lastError: null };
  if (result === 'UNCONFIGURED') return { status: 'SKIPPED', lastError: 'UNCONFIGURED' };
  if (result === 'GONE') return { status: 'SKIPPED', lastError: 'SUBSCRIPTION_GONE' };
  if (input.now.getTime() >= input.expiresAt.getTime())
    return { status: 'SKIPPED', lastError: 'EXPIRED' };
  if (input.attempts >= input.maxAttempts) return { status: 'DEAD', lastError: 'PUSH_FAILED' };
  const seconds = [30, 120, 600, 1800][Math.min(input.attempts - 1, 3)]!;
  const runAt = new Date(input.now.getTime() + seconds * 1000);
  return runAt.getTime() >= input.expiresAt.getTime()
    ? { status: 'SKIPPED', lastError: 'EXPIRED' }
    : { status: 'PENDING', lastError: 'PUSH_FAILED', runAt };
}
