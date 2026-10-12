import type { NoticeDeliveryError, NoticeDeliveryStatus } from '@spoh/shared';

export interface NoticeOutcome {
  status: NoticeDeliveryStatus; lastError: NoticeDeliveryError | null; runAt?: Date;
}

export function noticePushOutcome(result: 'ACCEPTED' | 'UNCONFIGURED' | 'GONE' | 'FAILED', input: {
  now: Date; expiresAt: Date; attempts: number; maxAttempts: number;
}): NoticeOutcome {
  if (result === 'ACCEPTED') return { status: 'SENT', lastError: null };
  if (result === 'UNCONFIGURED') return { status: 'SKIPPED', lastError: 'UNCONFIGURED' };
  if (result === 'GONE') return { status: 'SKIPPED', lastError: 'SUBSCRIPTION_GONE' };
  if (input.now >= input.expiresAt) return { status: 'SKIPPED', lastError: 'EXPIRED' };
  if (input.attempts >= input.maxAttempts) return { status: 'DEAD', lastError: 'PUSH_FAILED' };
  const delay = [30, 120, 600, 1800][Math.min(input.attempts - 1, 3)]!;
  const runAt = new Date(input.now.getTime() + delay * 1000);
  return runAt >= input.expiresAt ? { status: 'SKIPPED', lastError: 'EXPIRED' }
    : { status: 'PENDING', lastError: 'PUSH_FAILED', runAt };
}
