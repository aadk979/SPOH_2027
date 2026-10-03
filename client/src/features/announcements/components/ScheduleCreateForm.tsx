import type { AnnouncementDraftRecord } from '@spoh/shared';
import { Button, Callout, Field, Input } from '@/shared/ui';
import { useScheduleCreator } from '../hooks/useScheduleCreator';

export function ScheduleCreateForm({
  draft,
  timezone,
}: {
  draft: AnnouncementDraftRecord;
  timezone: string;
}) {
  const form = useScheduleCreator(draft, timezone);
  return (
    <fieldset disabled={form.create.isPending} className="flex min-w-0 flex-col gap-md">
      <h4 className="text-body font-semibold">Schedule saved version {draft.version}</h4>
      <p className="text-caption text-text-muted">
        Save message changes before scheduling. Times use {timezone}.
      </p>
      <p className="text-caption text-text-muted">
        During clock changes, repeated times use the first occurrence; skipped times move forward.
      </p>
      {draft.priority === 'URGENT' ? (
        <Callout tone="warn">
          This saved urgent message will request phone delivery when published.
        </Callout>
      ) : null}
      <Field id="publication-time" label={`Publish at (${timezone})`}>
        {(props) => (
          <Input
            {...props}
            type="datetime-local"
            value={form.wallTime}
            onChange={(event) => form.setWallTime(event.target.value)}
          />
        )}
      </Field>
      {form.error ? (
        <Callout tone="alert" role="alert">
          {form.error}
        </Callout>
      ) : null}
      {form.saved ? (
        <Callout role="status">Publication scheduled. Its current status appears below.</Callout>
      ) : null}
      <Button className="self-start" onClick={form.submit}>
        {form.create.isPending ? 'Scheduling…' : 'Schedule publication'}
      </Button>
    </fieldset>
  );
}
