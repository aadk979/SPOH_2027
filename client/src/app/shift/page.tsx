'use client';

import { useState, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { useOutboxEntries } from '@/components/SyncIndicator';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { flush, toClipboardText } from '@/lib/outbox';

/**
 * My shift, plus the sync diagnostics panel (BUILD_PLAN §9.5).
 *
 * The diagnostics half is the important part. When taps have failed for good,
 * an IC needs to be able to get the counts out of the phone and into the
 * fallback sheet — a failed capture should be recoverable, not merely visible.
 * Copying them as tab-separated text pastes straight into a Google Sheet.
 */
export default function ShiftPage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const entries = useOutboxEntries();
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  const failed = entries.filter((entry) => entry.status === 'failed');
  const pending = entries.filter((entry) => entry.status !== 'failed');

  async function copyFailed(): Promise<void> {
    await navigator.clipboard.writeText(toClipboardText(failed));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <AppShell title="My shift" back={{ href: '/home', label: 'Home' }}>
      <section className="mb-6">
        <h2
          className="mb-3 text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          Shifts
        </h2>

        {me && me.upcomingAssignments.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {me.upcomingAssignments.map((assignment) => (
              <li key={assignment.id} className="tile-flat">
                <p className="font-semibold">{assignment.station.name}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {assignment.dayLabel} ·{' '}
                  {assignment.block === 'MORNING' ? '09:30–14:00' : '13:30–18:00'} ·{' '}
                  {assignment.roleLabel}
                </p>
                {assignment.checkedInAt ? (
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-ok)' }}>
                    ✓ Checked in
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="tile">No shifts assigned yet. Check with your IC.</p>
        )}
      </section>

      <section>
        <h2
          className="mb-3 text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          Sync
        </h2>

        {entries.length === 0 ? (
          <p className="tile-flat" style={{ color: 'var(--color-ok)' }}>
            Everything you have captured has reached the server.
          </p>
        ) : (
          <div className="tile-flat">
            <p>
              <strong>{pending.length}</strong> waiting to send, <strong>{failed.length}</strong>{' '}
              could not be sent.
            </p>

            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className="pill" onClick={() => void flush({ force: true })}>
                Try again now
              </button>

              {failed.length > 0 ? (
                <button type="button" className="pill-quiet" onClick={() => void copyFailed()}>
                  {copied ? 'Copied ✓' : 'Copy failed captures'}
                </button>
              ) : null}
            </div>

            {failed.length > 0 ? (
              <>
                <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Give these to your IC to enter on the fallback sheet. They paste straight into a
                  spreadsheet.
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {failed.map((entry) => (
                    <li key={entry.id} style={{ color: 'var(--text-muted)' }}>
                      {new Date(entry.clientRecordedAt).toLocaleTimeString('en-SG', {
                        timeZone: 'Asia/Singapore',
                      })}{' '}
                      · {entry.endpoint} · {entry.attempts} attempts ·{' '}
                      {entry.lastError ?? 'unknown error'}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        )}
      </section>
    </AppShell>
  );
}
