import { useCallback, useEffect, useState } from 'react';
import type { ScheduledActionStatus } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { Button, Callout, LoadingRows } from '@/shared/ui';
import { useApplyCategoryCurrent, useCategoryActivity, useCategorySchedules } from '../queries';
import type { CategoryScheduleAction } from '../model/categoryScheduleReview';
import { CategoryScheduleCollection } from './CategoryScheduleCollection';
import { CategoryScheduleReview } from './CategoryScheduleReview';
import {
  categoryLatestSchedule,
  categoryPageRows,
  categoryReadsUnavailable,
} from '../model/collection';

export function CategoryScheduleContents(input: {
  categoryId: string;
  timezone: string;
  accessAvailable: boolean;
  readUnavailable: boolean;
  onReviewingChange: (reviewing: boolean) => void;
  onLockChange: (locked: boolean) => void;
  onDenied: () => void;
}) {
  const current = useCategoryActivity(input.categoryId, input.accessAvailable);
  const [status, setStatus] = useState<ScheduledActionStatus>();
  const schedules = useCategorySchedules(input.categoryId, status, input.accessAvailable);
  const applyCurrent = useApplyCategoryCurrent(input.categoryId);
  const [action, setAction] = useState<CategoryScheduleAction | null>(null);
  const denied = [current.error, schedules.error].some(
    (error) => error instanceof ApiError && [401, 403].includes(error.status),
  );
  useEffect(() => {
    if (denied) input.onDenied();
  }, [denied, input.onDenied]);
  useEffect(() => {
    input.onReviewingChange(!!action);
  }, [action, input.onReviewingChange]);
  const refreshSchedules = useCallback(async () => {
    if (!input.accessAvailable) return;
    const result = await schedules.refetch();
    if (result.isError) throw result.error;
  }, [input.accessAvailable, schedules.refetch]);
  if (denied) return null;
  if (!current.data && current.isPending) return <LoadingRows label="Loading current category" />;
  if (!current.data || (current.isError && !action))
    return (
      <>
        <Callout role="alert" tone="alert">
          Current category is unavailable. Reload before reviewing.
        </Callout>
        <Button
          variant="quiet"
          disabled={!input.accessAvailable || current.isFetching}
          onClick={() => input.accessAvailable && void current.refetch()}
        >
          Reload current category
        </Button>
      </>
    );
  const rows = categoryPageRows(schedules.data, schedules.isError);
  const readUnavailable = categoryReadsUnavailable(
    input.readUnavailable,
    current.isError,
    schedules.isError,
  );
  return action ? (
    <CategoryScheduleReview
      action={action}
      current={current.data}
      latest={categoryLatestSchedule(action, rows)}
      timezone={input.timezone}
      accessAvailable={input.accessAvailable}
      readUnavailable={readUnavailable}
      onApplied={applyCurrent}
      refreshSchedules={refreshSchedules}
      onClose={() => setAction(null)}
      onLockChange={input.onLockChange}
      onDenied={input.onDenied}
    />
  ) : (
    <CategoryScheduleCollection
      current={current.data}
      query={schedules}
      rows={rows}
      status={status}
      setStatus={setStatus}
      accessAvailable={input.accessAvailable}
      readUnavailable={readUnavailable}
      onReview={setAction}
    />
  );
}
