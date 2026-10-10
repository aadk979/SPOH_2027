'use client';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { ButtonLink, Callout, Stack } from '@/shared/ui';
import { ScheduleTimelinePanel } from '../components/ScheduleTimelinePanel';

export default function ScheduleScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  if (!session) return null;
  const enabled = allows('Schedule.Manage');
  return (
    <AppShell title="Schedule" back={{ href: '/overview', label: 'Overview' }}>
      <Stack>
        {!enabled ? (
          <Callout>Scheduled work is available to organisers.</Callout>
        ) : (
          <>
            <p>
              Review scheduled work and its outcomes. Schedule setting changes from Event settings,
              lifecycle changes from Overview, and publications from Content.
            </p>
            <ButtonLink href="/admin/settings" variant="secondary">
              Schedule a setting change
            </ButtonLink>
            <ScheduleTimelinePanel enabled={enabled} />
          </>
        )}
      </Stack>
    </AppShell>
  );
}
