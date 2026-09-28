'use client';

import type { ReactNode } from 'react';
import { RegistrationButtons } from '../components/RegistrationButtons';
import { AppShell } from '@/shared/shell/AppShell';
import { SyncIndicator } from '@/shared/shell/SyncIndicator';
import { Button, ButtonLink, Callout, EmptyState } from '@/shared/ui';
import { useCapture } from '@/features/capture';
import { useWakeLock } from '@/shared/hooks/useWakeLock';
import { useMe, useRequireSession } from '@/features/session';
import { useRegistrationSummary } from '@/features/registration';
import { formatCount } from '@/shared/lib/format';

/**
 * The sign-up booth (remediation/phases/P07-client-refactor.md).
 *
 * Eight buttons matching slide 14 exactly. One tap is one registration, written
 * immediately. No submit button, no confirmation screen, no modal on success —
 * a volunteer facing a queue will stop recording before they will slow down,
 * and every extra interaction here is lost data rather than lost time.
 */

export default function RegistrationCaptureScreen(): ReactNode {
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
  const boothTotal = useRegistrationSummary(stationId);

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
          inside a thumb's arc. Each cell is at least 88 × 88 (remediation/standards/engineering-standards.md)
          and the e2e suite measures it.
        */}
        <RegistrationButtons stationId={stationId} capture={capture} />

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
