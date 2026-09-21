'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { needsAttention, subscribeToOutbox, type OutboxEntry } from '@/lib/outbox';
import { cx } from './ui/cx';

/**
 * The unsynced count, visible at all times on every capture screen
 * (BUILD_PLAN §9.5).
 *
 * A volunteer who cannot see whether their taps are landing will keep tapping
 * into a void for an hour. The amber state is deliberately loud — it is the
 * moment the volunteer should go and tell their IC, not the moment they should
 * quietly hope it clears.
 */
export function useOutboxEntries(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => subscribeToOutbox(setEntries), []);
  return entries;
}

/**
 * Sits in the sub-nav beside the page title.
 *
 * A dot and a word, not a word alone: at a glance in a bright hall the shape
 * carries further than the reading does, and the word is still there for
 * anyone who cannot tell the two colours apart (BUILD_PLAN §9.7).
 */
export function SyncIndicator(): ReactNode {
  const entries = useOutboxEntries();
  const unsent = entries.filter((entry) => entry.status !== 'failed').length;
  const failed = entries.filter((entry) => entry.status === 'failed').length;
  const settled = unsent === 0 && failed === 0;

  return (
    <span
      // Polite, not assertive: this changes on every tap, and an assertive
      // region would interrupt the screen reader hundreds of times an hour.
      aria-live="polite"
      className={cx(
        'flex items-center gap-xs text-caption font-semibold whitespace-nowrap',
        settled ? 'text-ok' : 'text-warn',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('size-[8px] shrink-0 rounded-pill', settled ? 'bg-ok' : 'bg-warn')}
      />
      {settled ? (
        'All synced'
      ) : (
        <>
          {unsent > 0 ? `${unsent} unsynced` : null}
          {unsent > 0 && failed > 0 ? ' · ' : null}
          {failed > 0 ? `${failed} failed` : null}
        </>
      )}
    </span>
  );
}

/** The persistent banner that tells the volunteer to escalate. */
export function SyncWarningBanner(): ReactNode {
  const entries = useOutboxEntries();
  if (!needsAttention(entries)) return null;

  const failed = entries.filter((entry) => entry.status === 'failed').length;

  return (
    <div role="status" className="bg-warn-surface px-md py-sm text-caption text-warn">
      <p className="mx-auto max-w-reading">
        <strong>Taps are not reaching the server.</strong>{' '}
        {failed > 0
          ? `${failed} could not be sent. Tell your IC — the counts can still be recovered from the Shift screen.`
          : 'Keep counting; tell your IC so they can watch the station total.'}
      </p>
    </div>
  );
}
