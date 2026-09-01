'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { SyncIndicator } from '@/components/SyncIndicator';
import { useCapture, useWakeLock } from '@/features/capture/useCapture';
import { useMe, useRequireSession } from '@/features/session/useSession';

/**
 * The footfall counter (BUILD_PLAN §9.4, PRODUCT_BRIEF §3).
 *
 * This replaces a physical clicker, so it has to be usable one-handed without
 * looking: one enormous `+`, the room name, the count, a small undo. Nothing
 * else on the screen.
 *
 * Pre-assigned, not chosen. The usher opens the app and it already knows they
 * are on DCDF Station this block — a station picker here would be one more
 * thing to get wrong at 1:30pm.
 *
 * Increment-only. There is no way to edit history from this screen, because
 * editable history is how tallies get "tidied up" into fiction.
 */

/** Nudge after this long with no taps — catches the phone that went in a pocket. */
const IDLE_NUDGE_MS = 20 * 60 * 1000;

export default function FootfallCapturePage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const { sessionCount, undoable, capture, undo } = useCapture();
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useWakeLock(session !== null);

  const assignment = me?.currentAssignment;
  const station = assignment?.station;

  const resetIdle = (): void => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_NUDGE_MS);
  };

  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // Restart the idle clock whenever a tap lands.
  }, [sessionCount]);

  if (!session) return null;

  if (!station || !station.countsEntry) {
    return (
      <AppShell title="Counter" back={{ href: '/home', label: 'Home' }}>
        <p className="tile">
          {station
            ? `${station.name} is not a counted room, so entries are not recorded here.`
            : 'You are not on shift right now, so this counter is closed. It reopens when your shift starts.'}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      width="capture"
      title={station.name}
      back={{ href: '/home', label: 'Home' }}
      actions={<SyncIndicator />}
    >
      {idle ? (
        <p
          role="status"
          className="mb-4 rounded-lg px-4 py-3"
          style={{ background: 'var(--color-warn-surface)', color: 'var(--color-warn)' }}
        >
          No entries counted for 20 minutes. Still on the door?
        </p>
      ) : null}

      <p className="mb-3 text-center">
        <span
          className="block text-6xl font-semibold"
          style={{ fontFamily: 'var(--font-display)' }}
          aria-live="polite"
        >
          {sessionCount}
        </span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          counted on this device this session
        </span>
      </p>

      <button
        type="button"
        className="capture-primary"
        aria-label={`Count one entry to ${station.name}`}
        onClick={() => {
          resetIdle();
          void capture({
            endpoint: '/footfall/ticks',
            body: { stationId: station.id },
            label: 'entry',
          });
        }}
      >
        +
      </button>

      <div className="mt-4 flex min-h-[56px] items-center justify-between gap-3">
        {undoable ? (
          <>
            <span aria-live="polite">Counted one entry</span>
            <button type="button" className="pill-quiet" onClick={() => void undo()}>
              Undo
            </button>
          </>
        ) : (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            One tap per person entering the room.
          </span>
        )}
      </div>
    </AppShell>
  );
}
