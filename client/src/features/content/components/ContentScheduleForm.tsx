import type { FormEvent, ReactNode } from 'react';
import { ScheduleContentRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useEventTime } from '@/features/session';
import { Button, Callout, Field, Input, Stack } from '@/shared/ui';
import { useScheduleContent } from '../queries';
export function ContentScheduleForm({ version }: { version: number }): ReactNode {
  const form = useZodForm(ScheduleContentRequest, { runAt: '' });
  const schedule = useScheduleContent();
  const time = useEventTime();
  function submit(event: FormEvent): void {
    event.preventDefault();
    const input = form.validate({
      runAt: form.values.runAt,
      expectedVersion: version,
      idempotencyKey: crypto.randomUUID(),
    });
    if (input) schedule.mutate({ runAt: input.runAt, expectedVersion: input.expectedVersion });
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <Field
          id="content-publish-at"
          label="Publish later"
          error={form.errors.runAt}
          hint="Enter a date and time with its timezone, for example 2026-11-04T08:00:00+08:00. Only this reviewed draft is scheduled."
        >
          {(props) => (
            <Input
              {...props}
              value={form.values.runAt}
              onChange={(event) => form.setField('runAt', event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="secondary" disabled={schedule.isPending}>
          Schedule publication
        </Button>
        {schedule.error ? (
          <Callout tone="alert" role="alert">
            {schedule.error.message}
          </Callout>
        ) : null}
        {schedule.data ? (
          <p role="status">
            Scheduled for {time.dateTime(schedule.data.runAt)}. Editing the draft prevents this
            scheduled version from publishing.
          </p>
        ) : null}
      </Stack>
    </form>
  );
}
