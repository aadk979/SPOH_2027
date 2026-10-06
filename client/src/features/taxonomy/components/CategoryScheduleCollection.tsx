import type {
  CategoryActivityResponse,
  CategoryScheduleRecord,
  ScheduledActionStatus,
} from '@spoh/shared';
import { Button, Callout, Field, LoadingRows, Select } from '@/shared/ui';
import type { useCategorySchedules } from '../queries';
import type { CategoryScheduleAction } from '../model/categoryScheduleReview';
import { scheduleStatusLabels } from '../model/copy';
import { CategoryScheduleRows } from './CategoryScheduleRows';
import { categoryScheduleCreationAllowed } from '../model/collection';

type CollectionInput = {
  current: CategoryActivityResponse;
  query: ReturnType<typeof useCategorySchedules>;
  rows: CategoryScheduleRecord[];
  status?: ScheduledActionStatus;
  setStatus: (status: ScheduledActionStatus | undefined) => void;
  accessAvailable: boolean;
  readUnavailable: boolean;
  onReview: (action: CategoryScheduleAction) => void;
};
export function CategoryScheduleCollection(input: CollectionInput) {
  const { query } = input;
  const disabled = categoryCollectionDisabled(input);
  const readDisabled = !input.accessAvailable || query.isFetching;
  const canCreate = categoryScheduleCreationAllowed({
    disabled,
    success: query.isSuccess,
    error: query.isError,
    more: query.hasNextPage,
    filtered: input.status !== undefined,
  });
  return (
    <div className="flex flex-col gap-md">
      <h3 className="text-section">{input.current.data.label} schedules</h3>
      <p>Current category: {input.current.data.active ? 'Active' : 'Inactive'}</p>
      <p className="text-caption">
        A scheduled change sets the category to its selected state, even if the category changes
        before execution. Current creator authority and event lifecycle are checked when it runs.
      </p>
      <CategoryScheduleFilter
        status={input.status}
        disabled={!input.accessAvailable}
        onChange={input.setStatus}
      />
      {query.isError ? (
        <Callout tone="alert" role="alert">
          Category schedules are unavailable. Reload before reviewing.
        </Callout>
      ) : null}
      {query.isPending ? <LoadingRows label="Loading category schedules" /> : null}
      <Button
        variant="quiet"
        disabled={readDisabled}
        onClick={() => input.accessAvailable && void query.refetch()}
      >
        Reload category schedules
      </Button>
      {query.isSuccess && !query.isError ? (
        <CategoryScheduleRows rows={input.rows} disabled={disabled} onReview={input.onReview} />
      ) : null}
      {query.hasNextPage && !query.isError ? (
        <Button
          variant="quiet"
          disabled={readDisabled}
          onClick={() => input.accessAvailable && void query.fetchNextPage()}
        >
          Load more category schedules
        </Button>
      ) : null}
      <Button disabled={!canCreate} onClick={() => input.onReview({ kind: 'create' })}>
        Review future category change
      </Button>
      <p className="text-caption">
        Review all statuses and remaining pages before adding a schedule.
      </p>
    </div>
  );
}
function categoryCollectionDisabled(input: CollectionInput) {
  return (
    !input.accessAvailable || input.readUnavailable || input.current.eventStatus === 'ARCHIVED'
  );
}
function CategoryScheduleFilter({
  status,
  disabled,
  onChange,
}: {
  status?: ScheduledActionStatus;
  disabled: boolean;
  onChange: (status: ScheduledActionStatus | undefined) => void;
}) {
  return (
    <Field id="category-schedule-status" label="Category schedule status">
      {(props) => (
        <Select
          {...props}
          value={status ?? 'ALL'}
          disabled={disabled}
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
