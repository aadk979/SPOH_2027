'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { EmptyState, LoadingRows, Stack, ErrorState } from '@/shared/ui';
import { useRequireSession } from '../useSession';
import { useDevices } from '../queries';
import { DeviceCard } from '../components/DeviceCard';

export default function DevicesScreen(): ReactNode {
  const session = useRequireSession();
  const devices = useDevices();
  if (!session) return null;
  return (
    <AppShell title="Your devices" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        <p>
          Sign out a borrowed or lost device. Signing it out keeps its unsent captures on that
          device.
        </p>
        {devices.isPending ? (
          <LoadingRows label="Loading devices" />
        ) : devices.isError ? (
          <ErrorState error={devices.error} />
        ) : devices.data.length === 0 ? (
          <EmptyState title="No active devices" />
        ) : (
          devices.data.map((device) => <DeviceCard key={device.id} device={device} />)
        )}
      </Stack>
    </AppShell>
  );
}
