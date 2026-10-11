'use client';
import { useState } from 'react';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, Field, Section, Select, Stack } from '@/shared/ui';
import { listStaffingDays } from '../api';
import { useStaffingRead } from '../queries';
import { BriefingScheduler } from '../components/BriefingScheduler';
import { BriefingWaves } from '../components/BriefingWaves';
import { selectedStaffingDay } from '../model/board';

export default function BriefingsScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const [dayId, setDayId] = useState('');
  const days = useStaffingRead('days', listStaffingDays, !!session);
  const day = !days.isError && days.data ? selectedStaffingDay(days.data, dayId) : undefined;
  if (!session) return null;
  return (
    <AppShell title="Briefing schedule" back={{ href: '/shift', label: 'My shift' }}>
      <Stack>
        {days.isError ? (
          <Callout tone="alert" role="alert">
            {days.error.message}
          </Callout>
        ) : null}
        {day ? (
          <Field id="briefing-day" label="Briefing day">
            {(props) => (
              <Select {...props} value={day.id} onChange={(event) => setDayId(event.target.value)}>
                {days.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.date}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <p>No event days have been configured.</p>
        )}
        {allows('Roster.Edit') && allows('People.Read') && day ? (
          <Section title="Schedule a wave">
            <BriefingScheduler day={day} />
          </Section>
        ) : null}
        <Section title="Briefing waves">
          {day ? <BriefingWaves dayId={day.id} canComplete={allows('Briefing.Complete')} /> : null}
        </Section>
      </Stack>
    </AppShell>
  );
}
