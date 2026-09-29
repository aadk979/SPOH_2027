import type { RedeemGiftResponse } from '@spoh/shared';
import type { Tone } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';

type Message = { tone: Tone; text: string };

export function redemptionMessage(result: RedeemGiftResponse): Message {
  return result.warning
    ? { tone: 'warn', text: result.warning }
    : { tone: 'ok', text: `${result.giftType.name} redeemed. ${result.giftType.remaining} left.` };
}

/**
 * Offline: the gift is handed over and the redemption waits on this phone. If
 * it breaks the stock or one-per-journey rule when it syncs, it is recorded and
 * flagged for the IC rather than refused (ADR-007 §5, F03-034).
 */
export const QUEUED_REDEMPTION: Message = {
  tone: 'warn',
  text: 'No connection. Hand over the gift: the redemption is saved on this phone and will send when the connection returns.',
};

/** A refusal says why; anything else (the phone could not even queue it) goes to the IC. */
export function redemptionFailureMessage(error: unknown): Message {
  return {
    tone: 'alert',
    text:
      error instanceof ApiError
        ? error.message
        : 'Could not reach the server. Hand over the gift and tell your IC.',
  };
}
