'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, Stack } from '@/shared/ui';
import { SetupChecklist } from '../components/SetupChecklist';
import { GoLiveReadinessPanel } from '../components/GoLiveReadinessPanel';

export default function SetupScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  if (!session) return null;
  return (
    <AppShell title="Setup" width="wide" back={{ href: '/overview', label: 'Overview' }}>
      <Stack>
        {!allows('Settings.Read') ? (
          <Callout>Event setup is available to organisers.</Callout>
        ) : (
          <>
            <p>
              Complete the setup sections, then check readiness before moving the event to Ready or
              Live.
            </p>
            <SetupChecklist />
            <GoLiveReadinessPanel />
          </>
        )}
      </Stack>
    </AppShell>
  );
}
