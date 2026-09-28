'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Section, Stack } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { useAttendanceScreen } from '../hooks/useAttendanceScreen';
import { PresenceConfirmed } from '../components/PresenceConfirmed';
import { RootStart } from '../components/RootStart';
import { ProofEntry } from '../components/ProofEntry';
import { AttendanceStatus } from '../components/AttendanceStatus';
import { VerifierPanel } from '../components/VerifierPanel';

export default function AttendanceScreen(): ReactNode {
  const session = useRequireSession();
  const controller = useAttendanceScreen(Boolean(session));
  const { status, start } = controller;
  if (!session) return null;
  const data = status.data;
  const present = data?.attendance;
  return (
    <AppShell title="Attendance" back={{ href: '/shift', label: 'My shift' }}>
      <Stack>
        <AttendanceStatus controller={controller} />
        {data?.configured && data.eventDay ? (
          <>
            <Section title={data.eventDay.label}>
              {present ? (
                <PresenceConfirmed present={present} />
              ) : data.isRoot ? (
                <RootStart start={start} />
              ) : (
                <ProofEntry data={data} controller={controller} />
              )}
            </Section>
            {data.canIssue ? <VerifierPanel data={data} controller={controller} /> : null}
          </>
        ) : null}
      </Stack>
    </AppShell>
  );
}
