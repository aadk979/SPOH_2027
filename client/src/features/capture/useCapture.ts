'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { enqueue, cancel as cancelOutboxEntry } from '@/shared/lib/outbox';
import { useEvent } from '@/shared/lib/eventContext';
import { ms } from '@/shared/lib/runtimeSettings';
import { useToast } from '@/shared/ui';

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
  feedback: string | null;
  capture(input: { endpoint: string; body: object; label: string }): Promise<void>;
  undo(): Promise<void>;
}

export function useCapture(): UseCaptureResult {
  const [sessionCount, setSessionCount] = useState(0);
  const [undoable, setUndoable] = useState<CaptureTap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const announce = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { id: eventId, status } = useEvent();
  const rehearsal = status === 'REHEARSAL';

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
          eventId,
          path: input.endpoint,
          body: {
            ...input.body,
            rehearsal,
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
      setFeedback('Saved on this phone. Waiting to sync.');
      announce('Capture saved on this phone.');
      setSessionCount((count) => count + 1);
      setUndoable({ id: idempotencyKey, label: input.label, at: Date.now() });

      // Short, sharp haptic. Confirms the tap registered without asking the
      // volunteer to look at the screen.
      navigator.vibrate?.(15);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setUndoable((current) => current?.id === idempotencyKey ? null : current);
      }, ms.undoWindow());
    },
    [eventId, rehearsal, announce],
  );

  const undo = useCaptureUndo({ undoable, timer, setUndoable, setSessionCount, setFeedback, setError, announce });
  return { sessionCount, undoable, error, feedback, capture, undo };
}

function useCaptureUndo({ undoable, timer, setUndoable, setSessionCount, setFeedback, setError, announce }: {
  undoable: CaptureTap | null; timer: RefObject<ReturnType<typeof setTimeout> | null>;
  setUndoable: Dispatch<SetStateAction<CaptureTap | null>>; setSessionCount: Dispatch<SetStateAction<number>>;
  setFeedback: Dispatch<SetStateAction<string | null>>; setError: Dispatch<SetStateAction<string | null>>; announce(text: string): void;
}) {
  return useCallback(async (): Promise<void> => {
    if (!undoable) return;
    if (timer.current) clearTimeout(timer.current);
    if (Date.now() - undoable.at > ms.undoWindow()) {
      setFeedback('The undo window ended. Ask your IC for a correction.');
    } else {
      try {
        const removed = await cancelOutboxEntry(undoable.id);
        if (removed) setSessionCount((count) => Math.max(0, count - 1));
        const message = removed ? 'Capture removed from this phone.' : 'This capture is sending or already recorded. Ask your IC for a correction.';
        setFeedback(message);
        announce(message);
      } catch {
        setError('Cancellation was not confirmed. Keep this capture and ask your IC to check it.');
      }
    }
    // A newer tap may finish queuing while this cancellation is awaiting IndexedDB.
    setUndoable((current) => current?.id === undoable.id ? null : current);
  }, [undoable, announce, timer, setUndoable, setSessionCount, setFeedback, setError]);
}
