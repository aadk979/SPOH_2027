'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { RegistrationSummaryResponse, VisitorCategory } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { SyncIndicator } from '@/components/SyncIndicator';
import { useCapture, useWakeLock } from '@/features/capture/useCapture';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * The sign-up booth (BUILD_PLAN §9.4, PRODUCT_BRIEF §2).
 *
 * Eight buttons matching slide 14 exactly. One tap is one registration, written
 * immediately. No submit button, no confirmation screen, no modal on success —
 * a volunteer facing a queue will stop recording before they will slow down,
 * and every extra interaction here is lost data rather than lost time.
 */

const CATEGORIES: Array<{ value: VisitorCategory; label: string }> = [
  { value: 'SEC_1', label: 'Sec 1' },
  { value: 'SEC_2', label: 'Sec 2' },
  { value: 'SEC_3', label: 'Sec 3' },
  { value: 'SEC_4', label: 'Sec 4' },
  { value: 'SEC_5', label: 'Sec 5' },
  { value: 'GRADUATED_AWAITING_RESULTS', label: 'Graduated' },
  { value: 'PARENT_GUARDIAN', label: 'Parent / Guardian' },
  { value: 'OTHER', label: 'Other' },
];

export default function RegistrationCapturePage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const { sessionCount, undoable, capture, undo } = useCapture();

  useWakeLock(session !== null);

  const stationId = me?.currentAssignment?.station.id;

  /**
   * The booth-wide total, polled. Two volunteers working the same queue can see
   * their own contribution alongside the booth's, which is how a discrepancy
   * becomes visible before it becomes a reconciliation problem (§2.4).
   */
  const boothTotal = useQuery({
    queryKey: ['registrations', 'summary', stationId],
    queryFn: () =>
      api<RegistrationSummaryResponse>(
        `/registrations/summary?groupBy=category&stationId=${stationId ?? ''}`,
      ),
    enabled: Boolean(stationId),
    refetchInterval: 15_000,
    // A volunteer cannot read this endpoint; only the IC view shows the booth
    // total. Failing quietly is correct — the session count still works.
    retry: false,
  });

  if (!session) return null;

  if (!stationId) {
    return (
      <AppShell title="Registration" back={{ href: '/home', label: 'Home' }}>
        <p className="tile">
          You are not on shift at the sign-up booth right now, so registrations cannot be recorded
          from this device. Check with your IC.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Registration"
      back={{ href: '/home', label: 'Home' }}
      actions={<SyncIndicator />}
    >
      <div className="mb-4 flex items-baseline justify-between">
        <p>
          <span className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            {sessionCount}
          </span>
          <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            this device
          </span>
        </p>
        {boothTotal.data ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Booth today: <strong>{boothTotal.data.total}</strong> registrations
          </p>
        ) : null}
      </div>

      {/* 2 x 4 grid, each cell at least 88px, filling the viewport. */}
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            type="button"
            className="capture-target"
            onClick={() =>
              void capture({
                endpoint: '/registrations',
                body: { category: category.value, stationId },
                label: category.label,
              })
            }
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex min-h-[56px] items-center justify-between gap-3">
        {undoable ? (
          <>
            <span aria-live="polite">Recorded {undoable.label}</span>
            <button type="button" className="pill-quiet" onClick={() => void undo()}>
              Undo
            </button>
          </>
        ) : (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Tap a category for each visitor. Undo is available for ten seconds.
          </span>
        )}
      </div>

      <Link href="/capture/registration/group" className="pill mt-6 inline-block">
        A family arriving together
      </Link>
    </AppShell>
  );
}
