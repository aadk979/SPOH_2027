'use client';
import { useAllows, useMe, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { ButtonLink, Callout, Card, Section, Stack } from '@/shared/ui';
import { ScheduleLifecycleForm } from '../components/ScheduleLifecycleForm';
import { ScheduleReportForm } from '../components/ScheduleReportForm';
import { ScheduleTimelinePanel } from '../components/ScheduleTimelinePanel';

function ScheduleProducers({ timezone, reports }: { timezone: string; reports: boolean }) {
  return (
    <>
      <Section title="Schedule a lifecycle change">
        <Card>
          <ScheduleLifecycleForm timezone={timezone} />
        </Card>
      </Section>
      {reports ? (
        <Section title="Schedule a report snapshot">
          <Card>
            <ScheduleReportForm timezone={timezone} />
          </Card>
        </Section>
      ) : null}
    </>
  );
}

export default function ScheduleScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const timezone = useMe().data?.event?.timezone;
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
              Schedule lifecycle changes and report snapshots here. Setting changes are scheduled
              from Event settings, and publications from Content. Every scheduled change checks
              permission and readiness again when it runs.
            </p>
            <ButtonLink href="/admin/settings" variant="secondary">
              Schedule a setting change
            </ButtonLink>
            {timezone ? (
              <ScheduleProducers timezone={timezone} reports={allows('Report.Generate')} />
            ) : null}
            <ScheduleTimelinePanel enabled={enabled} />
          </>
        )}
      </Stack>
    </AppShell>
  );
}
