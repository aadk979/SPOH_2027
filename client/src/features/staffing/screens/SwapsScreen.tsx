'use client';
import { useAllows, useMe, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, Section, Stack } from '@/shared/ui';
import { listSwapTargets } from '../api';
import { useStaffingRead } from '../queries';
import { SwapRequestForm } from '../components/SwapRequestForm';
import { SwapReviewQueue } from '../components/SwapReviewQueue';
import { MySwapHistory } from '../components/MySwapHistory';

export default function SwapsScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const me = useMe();
  const targets = useStaffingRead('swap-targets', listSwapTargets, allows('Swap.Request'));
  if (!session) return null;
  return (
    <AppShell title="Shift swaps" back={{ href: '/shift', label: 'My shift' }}>
      <Stack>
        {allows('Swap.Request') && me.data && !targets.isError && targets.data ? (
          <Section title="Request a swap">
            <SwapRequestForm assignments={me.data.upcomingAssignments} targets={targets.data} />
          </Section>
        ) : (
          <p>Swap creation is unavailable until your assignments and permissions load.</p>
        )}
        {targets.isError ? (
          <Callout tone="alert" role="alert">
            {targets.error.message}
          </Callout>
        ) : null}
        <Section title="My requests">
          <MySwapHistory />
        </Section>
        {allows('Swap.Decide') ? (
          <Section title="Review requests">
            <SwapReviewQueue />
          </Section>
        ) : null}
      </Stack>
    </AppShell>
  );
}
