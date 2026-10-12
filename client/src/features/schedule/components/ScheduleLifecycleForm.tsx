'use client';
import type { ReactNode } from 'react';
import { EventStatus } from '@spoh/shared';
import { Button, ErrorState, Field, LoadingRows, Select, Stack, Textarea } from '@/shared/ui';
import { useLifecycleScheduleForm } from '../hooks/useScheduleForms';
import { eventStatusLabels } from '../model/producerForms';
import { ScheduleFormOutcome } from './ScheduleFormOutcome';
import { ScheduleWallTimeField } from './ScheduleWallTimeField';

/**
 * A lifecycle change at a chosen time. Readiness is checked again when it runs, so a change
 * blocked now can still be scheduled for after the blocker is fixed.
 */
export function ScheduleLifecycleForm({ timezone }: { timezone: string }): ReactNode {
  const { readiness, form, produce, invalid, submit } = useLifecycleScheduleForm(timezone);
  if (readiness.error) return <ErrorState error={readiness.error} operation="Loading lifecycle readiness" onRetry={() => void readiness.refetch()} />;
  if (readiness.isPending) return <LoadingRows />;
  const options = readiness.data?.transitions ?? [];
  if (!readiness.data || options.length === 0)
    return <p>This event has no lifecycle change to schedule from its current state.</p>;
  return (
    <form onSubmit={submit}>
      <Stack>
        <p>Currently {eventStatusLabels[readiness.data.lifecycle.status].toLowerCase()}.</p>
        <Field id="schedule-lifecycle-to" label="Move the event to" error={form.errors.to}>
          {(props) => (
            <Select
              {...props}
              value={form.values.to}
              onChange={(event) => form.setField('to', EventStatus.parse(event.target.value))}
            >
              <option value="">Choose a state</option>
              {options.map((option) => (
                <option key={option.to} value={option.to}>
                  {eventStatusLabels[option.to]}
                  {option.allowed ? '' : ' (blocked right now)'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ScheduleWallTimeField
          id="schedule-lifecycle-time"
          label="Change at"
          timezone={timezone}
          value={form.values.wallTime}
          error={form.errors.wallTime}
          onChange={form.setter('wallTime')}
        />
        <Field id="schedule-lifecycle-reason" label="Reason (required to reopen)">
          {(props) => (
            <Textarea
              {...props}
              maxLength={500}
              value={form.values.reason}
              onChange={(event) => form.setField('reason', event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={produce.isPending}>
          {produce.isPending ? 'Scheduling…' : 'Schedule lifecycle change'}
        </Button>
        <ScheduleFormOutcome invalid={invalid} error={produce.error} done={produce.isSuccess} />
      </Stack>
    </form>
  );
}
