'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { enqueue, cancel as cancelOutboxEntry } from '@/lib/outbox';
import { ms } from '@/lib/runtimeSettings';

/**
 * The shared mechanics behind both capture screens (BUILD_PLAN §9.4).
 *
 * Every tap follows the same path, and the order matters:
 *
 *   1. mint an idempotency key
 *   2. write to the outbox   <- before the network, always
 *   3. increment the optimistic count
 *   4. haptic feedback
 *   5. let the flush loop send it
 *
 * The volunteer never waits for the server, never sees a confirmation dialog,
 * and never loses a tap to a dead spot. Undo within ten seconds removes the
 * queued entry outright if it has not been sent, which is cleaner than sending
 * and then voiding — a void leaves a correction in the audit trail for
 * something that never really happened.
 */

/**
 * How long undo stays available after a tap.
 *
 * Shipped default; the live value is a runtime setting, because how long a
 * booth volunteer needs to notice a mis-tap is exactly the kind of thing a dry
 * run tells you and a redeploy should not gate.
 */
export const UNDO_WINDOW_MS = 10_000;

export interface CaptureTap {
  /** The idempotency key, which is also the outbox entry id. */
  id: string;
  /** What was captured, for the undo label — a category, or just "entry". */
  label: string;
  at: number;
}

export interface UseCaptureResult {
  /** Optimistic count for this device since the screen was opened. */
  sessionCount: number;
  /** The tap that can still be undone, if any. */
  undoable: CaptureTap | null;
  /**
   * Set when the most recent tap could not even be queued locally — not a
   * network failure (the outbox absorbs those invisibly), but the local
   * database itself refusing the write. Rare, but silent here means a
   * volunteer keeps tapping into a void for an hour, which is the one
   * outcome this whole screen exists to prevent.
   */
  error: string | null;
  capture(input: { endpoint: string; body: object; label: string }): Promise<void>;
  undo(): Promise<void>;
}

export function useCapture(): UseCaptureResult {
  const [sessionCount, setSessionCount] = useState(0);
  const [undoable, setUndoable] = useState<CaptureTap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const capture = useCallback(
    async (input: { endpoint: string; body: object; label: string }): Promise<void> => {
      const idempotencyKey = crypto.randomUUID();

      try {
        await enqueue({
          idempotencyKey,
          endpoint: input.endpoint,
          body: {
            ...input.body,
            idempotencyKey,
            // The moment the volunteer actually tapped. The server stamps its
            // own time on receipt; storing both is what makes a phone that
            // slept for ten minutes visible rather than a silent dent in the
            // curve.
            clientRecordedAt: new Date().toISOString(),
          },
        });
      } catch {
        // The local write itself failed — not a network problem, so the
        // outbox cannot recover it. Tell the volunteer now, not never.
        setError('This tap was not recorded. Try again, and tell your IC if it keeps happening.');
        return;
      }

      setError(null);
      setSessionCount((count) => count + 1);
      setUndoable({ id: idempotencyKey, label: input.label, at: Date.now() });

      // Short, sharp haptic. Confirms the tap registered without asking the
      // volunteer to look at the screen.
      navigator.vibrate?.(15);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndoable(null), ms.undoWindow());
    },
    [],
  );

  const undo = useCallback(async (): Promise<void> => {
    if (!undoable) return;

    const removed = await cancelOutboxEntry(undoable.id);
    if (removed) setSessionCount((count) => Math.max(0, count - 1));

    // If it had already been sent, the correction is an IC-level void rather
    // than something a volunteer does mid-queue — the undo simply expires.
    setUndoable(null);
    if (timer.current) clearTimeout(timer.current);
  }, [undoable]);

  return { sessionCount, undoable, error, capture, undo };
}

/**
 * Hold a screen wake lock while a capture screen is open.
 *
 * A booth tablet that sleeps between visitors costs a tap to wake and a second
 * of the volunteer's attention every time. Best effort: not every browser
 * supports it, and it is released automatically when the tab is hidden.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const request = async (): Promise<void> => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Denied, unsupported, or the tab is not visible. Not worth surfacing.
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && !released) void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
