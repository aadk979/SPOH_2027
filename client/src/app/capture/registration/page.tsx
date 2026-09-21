'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { RegistrationSummaryResponse, VisitorCategory } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { SyncIndicator } from '@/components/SyncIndicator';
import { Button, ButtonLink, Callout, EmptyState } from '@/components/ui';
import { useCapture, useWakeLock } from '@/features/capture/useCapture';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/format';

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
  const { sessionCount, undoable, error, capture, undo } = useCapture();

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
        <EmptyState title="Registration is closed on this device">
          You are not on shift at the sign-up booth right now, so registrations cannot be recorded
          here. Check with your IC.
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell
      width="capture"
      title="Registration"
      back={{ href: '/home', label: 'Home' }}
      actions={<SyncIndicator />}
    >
      <div className="flex flex-col gap-md">
        {error ? (
          <Callout tone="alert" role="alert">
            {error}
          </Callout>
        ) : null}

        <div className="flex flex-wrap items-baseline justify-between gap-x-md gap-y-xxs">
          <p>
            <span className="font-display text-stat font-semibold tabular-nums">
              {sessionCount}
            </span>
            <span className="ml-xs text-caption text-text-muted">this device</span>
          </p>

          {boothTotal.data ? (
            <p className="text-caption text-text-muted">
              Booth today: <strong>{formatCount(boothTotal.data.total)}</strong> registrations
            </p>
          ) : null}
        </div>

        {/*
          2 × 4 on a phone, 4 × 2 once the row is wide enough to keep every cell
          inside a thumb's arc. Each cell is at least 88 × 88 (BUILD_PLAN §9.4)
          and the e2e suite measures it.
        */}
        <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
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

        {/* Holds its height so the grid never shifts under a thumb mid-queue. */}
        <div className="flex min-h-[56px] items-center justify-between gap-sm">
          {undoable ? (
            <>
              <span aria-live="polite">Recorded {undoable.label}</span>
              <Button variant="quiet" onClick={() => void undo()}>
                Undo
              </Button>
            </>
          ) : (
            <span className="text-caption text-text-muted">
              Tap a category for each visitor. Undo is available for ten seconds.
            </span>
          )}
        </div>

        {/* `self-start` so the pill sizes to its label: the parent is a flex
            column, which would otherwise stretch it across the whole booth. */}
        <ButtonLink href="/capture/registration/group" variant="secondary" className="self-start">
          A family arriving together
        </ButtonLink>
      </div>
    </AppShell>
  );
}
