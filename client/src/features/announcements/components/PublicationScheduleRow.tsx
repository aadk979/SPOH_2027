import type { AnnouncementDraftRecord, AnnouncementPublicationScheduleRecord } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout, Card, Field, Input } from '@/shared/ui';
import { useScheduleManagement } from '../hooks/useScheduleManagement';
import { scheduleErrorLabels } from '../model/scheduleForm';

const statusLabels = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  SUCCEEDED: 'Published',
  FAILED: 'Refused',
  DEAD: 'Failed',
  CANCELLED: 'Cancelled',
};
export function PublicationScheduleRow({
  draft,
  schedule,
  timezone,
  archived,
}: {
  draft: AnnouncementDraftRecord;
  schedule: AnnouncementPublicationScheduleRecord;
  timezone: string;
  archived: boolean;
}) {
  const form = useScheduleManagement({ draft, schedule, timezone });
  const format = useEventTime();
  const pending = schedule.status === 'PENDING' && !archived;
  return (
    <Card as="li" className="flex flex-col gap-sm">
      <p className="text-body font-semibold">
        {statusLabels[schedule.status]} · {format.dateTime(schedule.scheduledFor)}
      </p>
      <p className="text-caption text-text-muted">
        Draft version {schedule.draftVersion} · Schedule version {schedule.version} · {timezone}
      </p>
      {schedule.lastError ? (
        <Callout tone="warn">{scheduleErrorLabels[schedule.lastError]}</Callout>
      ) : null}
      {form.error ? (
        <Callout tone="alert" role="alert">
          {form.error}
        </Callout>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap gap-sm">
          {!draft.publishedAt ? (
            <Button
              variant="quiet"
              disabled={form.busy}
              onClick={() => form.setEditing(!form.editing)}
            >
              Edit publication time
            </Button>
          ) : null}
          <Button variant="quiet" disabled={form.busy} onClick={() => form.cancel.mutate()}>
            {form.cancel.isPending ? 'Cancelling…' : 'Cancel publication'}
          </Button>
        </div>
      ) : null}
      <PublicationTimeEditor
        form={form}
        draft={draft}
        schedule={schedule}
        timezone={timezone}
        pending={pending}
      />
    </Card>
  );
}

function PublicationTimeEditor({
  form,
  draft,
  schedule,
  timezone,
  pending,
}: {
  form: ReturnType<typeof useScheduleManagement>;
  draft: AnnouncementDraftRecord;
  schedule: AnnouncementPublicationScheduleRecord;
  timezone: string;
  pending: boolean;
}) {
  if (!form.editing || !pending || draft.publishedAt) return null;
  return (
    <fieldset disabled={form.busy} className="flex min-w-0 flex-col gap-sm">
      <Field id={`publication-edit-${schedule.id}`} label={`New publication time (${timezone})`}>
        {(props) => (
          <Input
            {...props}
            type="datetime-local"
            value={form.wallTime}
            onChange={(event) => form.setWallTime(event.target.value)}
          />
        )}
      </Field>
      <p className="text-caption">
        This updates publication to saved draft version {draft.version}.
      </p>
      <Button className="self-start" onClick={form.submit}>
        {form.update.isPending ? 'Updating…' : 'Save publication time'}
      </Button>
    </fieldset>
  );
}
