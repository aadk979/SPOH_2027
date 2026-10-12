'use client';

import { type ReactNode } from 'react';
import { AlertDelivery } from '@/features/notification';
import { AppShell } from '@/shared/shell/AppShell';
import { useSyncDiagnostics } from '../hooks/useSyncDiagnostics';
import { SyncDiagnostics } from '../components/SyncDiagnostics';
import { AssignmentList } from '../components/AssignmentList';
import { assignmentGroups } from '../model/assignmentGroups';
import { zonedDate } from '@spoh/shared';
import { ButtonLink, ErrorState, LoadingRows, Section, Stack } from '@/shared/ui';
import { useMe, useRequireSession } from '@/features/session';

/**
 * My shift, plus the sync diagnostics panel (remediation/phases/P07-client-refactor.md).
 *
 * The diagnostics half is the important part. When taps have failed for good,
 * an IC needs to be able to get the counts out of the phone and into the
 * fallback sheet — a failed capture should be recoverable, not merely visible.
 * Copying them as tab-separated text pastes straight into a Google Sheet.
 */
export default function ShiftScreen(): ReactNode {
  const session = useRequireSession();
  const query = useMe();
  const me = query.error ? undefined : query.data;
  const diagnostics = useSyncDiagnostics();
  if (!session) return null;

  return (
    <AppShell title="My shift" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        <SyncDiagnostics state={diagnostics} />
        <Section title="Shift planning">
          <ButtonLink href="/swaps">Request or review a shift swap</ButtonLink>
          <ButtonLink href="/briefings">Briefing schedule and completion</ButtonLink>
        </Section>
        <Section title="Attendance" description="Verify your presence with your admin or exco.">
          <ButtonLink href="/attendance">Submit attendance / verify team</ButtonLink>
        </Section>
        {query.error ? <ErrorState error={query.error} operation="Loading your shifts" onRetry={() => void query.refetch()} /> : null}
        {query.isPending ? <LoadingRows label="Loading your shifts" /> : null}
        {me ? <ShiftGroups me={me} /> : null}

        <Section title="Alerts" description="Whether this phone can reach you with the app closed.">
          <AlertDelivery />
        </Section>

      </Stack>
    </AppShell>
  );
}

function ShiftGroups({ me }: { me: NonNullable<ReturnType<typeof useMe>['data']> }) {
  const today = me.operationalDate ?? me.currentAssignment?.date ?? zonedDate(new Date(me.serverTime), me.event.timezone);
  const groups = assignmentGroups(me.upcomingAssignments, today);
  return <>
    <Section title="Today"><AssignmentList assignments={groups.today} empty="No shifts today" /></Section>
    <details><summary className="min-h-control cursor-pointer font-semibold">Upcoming shifts ({groups.upcoming.length})</summary><AssignmentList assignments={groups.upcoming} empty="No upcoming shifts" /></details>
    <details><summary className="min-h-control cursor-pointer font-semibold">Past shifts ({groups.past.length})</summary><AssignmentList assignments={groups.past} empty="No past shifts" /></details>
  </>;
}
