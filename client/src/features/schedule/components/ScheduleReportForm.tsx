'use client';
import type { ReactNode } from 'react';
import { useEventDays } from '@/features/eventDays';
import { Button, Checkbox, Field, Select, Stack } from '@/shared/ui';
import { useReportScheduleForm } from '../hooks/useScheduleForms';
import { ScheduleFormOutcome } from './ScheduleFormOutcome';
import { ScheduleWallTimeField } from './ScheduleWallTimeField';

/** A daily report frozen at a chosen time, for example after the last shift of the day ends. */
export function ScheduleReportForm({ timezone }: { timezone: string }): ReactNode {
  const days = useEventDays();
  const { form, produce, invalid, submit } = useReportScheduleForm(timezone);
  if (days.data && days.data.length === 0)
    return <p>Add the event days before scheduling reports.</p>;
  return (
    <form onSubmit={submit}>
      <Stack>
        <Field id="schedule-report-day" label="Day to report on" error={form.errors.eventDayId}>
          {(props) => (
            <Select
              {...props}
              value={form.values.eventDayId}
              onChange={(event) => form.setField('eventDayId', event.target.value)}
            >
              <option value="">Choose a day</option>
              {(days.data ?? []).map((day) => (
                <option key={day.id} value={day.id}>
                  {day.label} · {day.date}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ScheduleWallTimeField
          id="schedule-report-time"
          label="Take the snapshot at"
          timezone={timezone}
          value={form.values.wallTime}
          error={form.errors.wallTime}
          onChange={form.setter('wallTime')}
        />
        <Checkbox
          label="Include rehearsal records"
          checked={form.values.includeRehearsal}
          onChange={(event) => form.setField('includeRehearsal', event.target.checked)}
        />
        <Button type="submit" disabled={produce.isPending}>
          {produce.isPending ? 'Scheduling…' : 'Schedule report snapshot'}
        </Button>
        <ScheduleFormOutcome invalid={invalid} error={produce.error} done={produce.isSuccess} />
      </Stack>
    </form>
  );
}
