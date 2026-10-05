import type { CaptureScheduleRecord, ScheduledActionStatus } from '@spoh/shared';
import { Button, Callout, Field, Select, LoadingRows } from '@/shared/ui';
import type { useCaptureSchedules } from '../queries';
import type { CaptureScheduleAction } from '../model/captureScheduleReview';
import { scheduleStatusLabels } from '../model/copy';
import type { CaptureScheduleControlsInput } from '../model/captureScheduleControls';
import { CaptureScheduleRows } from './CaptureScheduleRows';

type CollectionInput = CaptureScheduleControlsInput & {
  query: ReturnType<typeof useCaptureSchedules>;
  rows: CaptureScheduleRecord[];
  status?: ScheduledActionStatus;
  setStatus: (status: ScheduledActionStatus | undefined) => void;
  onReview: (action: CaptureScheduleAction) => void;
};
export function CaptureScheduleCollection(input: CollectionInput) {
  const { query } = input;
  const disabled = input.readUnavailable || input.current.eventStatus === 'ARCHIVED';
  const canCreate = captureScheduleCreationAllowed(input);
  const showRows = query.isSuccess && !query.isError;
  const more = query.hasNextPage && !query.isError;
  return (
    <div className="flex flex-col gap-md">
      <h3 className="text-section">Capture schedules</h3>
      <p className="text-caption">
        Each action checks its reviewed capture version when it runs. An earlier change can prevent
        a later action from applying.
      </p>
      <CaptureScheduleFilter status={input.status} onChange={input.setStatus} />
      {query.isError ? (
        <Callout tone="alert" role="alert">
          Capture schedules are unavailable. Reload before reviewing.
        </Callout>
      ) : null}
      {query.isPending ? <LoadingRows label="Loading capture schedules" /> : null}
      <Button variant="quiet" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Reload capture schedules
      </Button>
      {showRows ? (
        <CaptureScheduleRows rows={input.rows} disabled={disabled} onReview={input.onReview} />
      ) : null}
      {more ? (
        <Button
          variant="quiet"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more capture schedules
        </Button>
      ) : null}
      <Button disabled={!canCreate} onClick={() => input.onReview({ kind: 'create' })}>
        Review future capture change
      </Button>
      <p className="text-caption">
        Review all statuses and remaining pages before adding a schedule.
      </p>
      <Button variant="quiet" onClick={input.onClose}>
        Back to capture controls
      </Button>
    </div>
  );
}
function captureScheduleCreationAllowed(input: CollectionInput) {
  return (
    !input.readUnavailable &&
    input.current.eventStatus !== 'ARCHIVED' &&
    input.query.isSuccess &&
    !input.query.isError &&
    !input.query.hasNextPage &&
    input.status === undefined
  );
}
function CaptureScheduleFilter({
  status,
  onChange,
}: {
  status?: ScheduledActionStatus;
  onChange: (status: ScheduledActionStatus | undefined) => void;
}) {
  return (
    <Field id="capture-schedule-status" label="Capture schedule status">
      {(props) => (
        <Select
          {...props}
          value={status ?? 'ALL'}
          onChange={(event) =>
            onChange(
              event.target.value === 'ALL'
                ? undefined
                : (event.target.value as ScheduledActionStatus),
            )
          }
        >
          <option value="ALL">All statuses</option>
          {Object.entries(scheduleStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
