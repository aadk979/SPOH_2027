'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { useEvent } from '@/shared/lib/eventContext';
import { Callout, Stack } from '@/shared/ui';
import { GoLiveReadinessPanel } from '../components/GoLiveReadinessPanel';
import { LifecyclePanel } from '../components/LifecyclePanel';
import { SetupChecklist } from '../components/SetupChecklist';

export default function OverviewScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const event = useEvent();
  const canTransition = (
    [
      'Event.MarkReady',
      'Event.GoLive',
      'Event.Close',
      'Event.Rehearse',
      'Event.Reopen',
      'Event.Archive',
    ] as const
  ).some((action) => allows(action));
  if (!session) return null;
  return (
    <AppShell title="Overview" width="wide" back={{ href: '/events', label: 'Your events' }}>
      <Stack>
        <h1 className="text-title">{event.name}</h1>
        {!allows('Settings.Read') ? (
          <Callout>Event setup is available to organisers.</Callout>
        ) : (
          <>
            <GoLiveReadinessPanel />
            <LifecyclePanel enabled={canTransition} />
            <SetupChecklist />
          </>
        )}
      </Stack>
    </AppShell>
  );
}
