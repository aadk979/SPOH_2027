'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { needsAttention, subscribeToOutbox, type OutboxEntry } from '@/lib/outbox';

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

export function SyncIndicator(): ReactNode {
  const entries = useOutboxEntries();
  const unsent = entries.filter((entry) => entry.status !== 'failed').length;
  const failed = entries.filter((entry) => entry.status === 'failed').length;

  if (unsent === 0 && failed === 0) {
    return (
      <span className="text-sm" style={{ color: 'var(--color-ok)' }}>
        All synced
      </span>
    );
  }

  return (
    <span className="text-sm font-semibold" style={{ color: 'var(--color-warn)' }}>
      {unsent > 0 ? `${unsent} unsynced` : null}
      {unsent > 0 && failed > 0 ? ' · ' : null}
      {failed > 0 ? `${failed} failed` : null}
    </span>
  );
}

/** The persistent banner that tells the volunteer to escalate. */
export function SyncWarningBanner(): ReactNode {
  const entries = useOutboxEntries();
  if (!needsAttention(entries)) return null;

  const failed = entries.filter((entry) => entry.status === 'failed').length;

  return (
    <div
      role="status"
      className="px-4 py-3 text-sm"
      style={{ background: 'var(--color-warn-surface)', color: 'var(--color-warn)' }}
    >
      <strong>Taps are not reaching the server.</strong>{' '}
      {failed > 0
        ? `${failed} could not be sent. Tell your IC — the counts can still be recovered from the Shift screen.`
        : 'Keep counting; tell your IC so they can watch the station total.'}
    </div>
  );
}
