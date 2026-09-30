'use client';

import { type ReactNode } from 'react';
import { AlertDelivery } from '@/features/notification';
import { AppShell } from '@/shared/shell/AppShell';
import { useSyncDiagnostics } from '../hooks/useSyncDiagnostics';
import { SyncDiagnostics } from '../components/SyncDiagnostics';
import { ButtonLink, Card, EmptyState, Section, Stack, StatusText } from '@/shared/ui';
import { useMe, useRequireSession, useEventTime } from '@/features/session';
import { blockLabel } from '@/shared/lib/format';
import { useClientSettings } from '@/shared/lib/runtimeSettings';

/**
 * My shift, plus the sync diagnostics panel (remediation/phases/P07-client-refactor.md).
 *
 * The diagnostics half is the important part. When taps have failed for good,
 * an IC needs to be able to get the counts out of the phone and into the
 * fallback sheet — a failed capture should be recoverable, not merely visible.
 * Copying them as tab-separated text pastes straight into a Google Sheet.
 */
export default function ShiftScreen(): ReactNode {
  const format = useEventTime();
  const session = useRequireSession();
  const { data: me } = useMe();
  const { shiftBlocks } = useClientSettings();
  const diagnostics = useSyncDiagnostics();
  if (!session) return null;

  return (
    <AppShell title="My shift" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        <Section title="Attendance" description="Verify your presence with your admin or exco.">
          <ButtonLink href="/attendance">Submit attendance / verify team</ButtonLink>
        </Section>
        <Section title="Shifts">
          {me && me.upcomingAssignments.length > 0 ? (
            <ul className="flex flex-col gap-xs">
              {me.upcomingAssignments.map((assignment) => (
                <Card as="li" variant="flat" key={assignment.id}>
                  <p className="font-semibold">{assignment.station.name}</p>
                  <p className="text-caption text-text-muted">
                    {assignment.dayLabel} · {blockLabel(assignment.block, shiftBlocks)} ·{' '}
                    {assignment.roleLabel}
                  </p>
                  {assignment.checkedInAt ? (
                    <StatusText tone="ok" className="mt-xxs block">
                      <span aria-hidden="true">✓ </span>
                      Checked in {format.time(assignment.checkedInAt)}
                    </StatusText>
                  ) : null}
                </Card>
              ))}
            </ul>
          ) : (
            <EmptyState title="No shifts assigned yet">
              Your IC assigns shifts from the roster. Check with them if the event has started.
            </EmptyState>
          )}
        </Section>

        <Section title="Alerts" description="Whether this phone can reach you with the app closed.">
          <AlertDelivery />
        </Section>

        <SyncDiagnostics state={diagnostics} />
      </Stack>
    </AppShell>
  );
}
