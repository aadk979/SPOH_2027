import type { StampCardResponse } from '@spoh/shared';
import type { Tone } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';
export function stampMessage(
  result: Pick<StampCardResponse, 'justCompleted' | 'stampAdded' | 'warning'>,
): { tone: Tone; text: string } {
  return result.justCompleted
    ? { tone: 'ok', text: 'Journey complete — send them to Mission Complete.' }
    : result.stampAdded
      ? { tone: 'ok', text: 'Stamped.' }
      : { tone: 'warn', text: result.warning ?? 'Already stamped here.' };
}

/** Offline: the stamp waits on this phone and sends itself (ADR-007 §5, F03-034). */
export const QUEUED_STAMP: { tone: Tone; text: string } = {
  tone: 'warn',
  text: 'No connection. The stamp is saved on this phone and will send when the connection returns.',
};

/** A refusal says why; anything else (the phone could not even queue it) is a stamp by hand. */
export function stampFailureMessage(error: unknown): { tone: Tone; text: string } {
  return {
    tone: 'alert',
    text:
      error instanceof ApiError
        ? error.message
        : 'Could not reach the server. Stamp the card and carry on.',
  };
}
