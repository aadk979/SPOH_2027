import { useEffect } from 'react';
import { useEventTime } from '@/features/session';
import { Button, Callout } from '@/shared/ui';
import { useCategoryScheduleReview } from '../hooks/useCategoryScheduleReview';
import type { CategoryScheduleReviewInput } from '../model/controls';
import { scheduleStatusLabels } from '../model/copy';
import { CategoryScheduleReviewFields } from './CategoryScheduleReviewFields';

export function CategoryScheduleReview(
  input: CategoryScheduleReviewInput & {
    onClose: () => void;
    onDenied: () => void;
    onLockChange: (locked: boolean) => void;
  },
) {
  const review = useCategoryScheduleReview(input);
  const clock = useEventTime();
  useEffect(() => {
    input.onLockChange(review.locked);
  }, [input.onLockChange, review.locked]);
  useEffect(() => {
    if (review.denied) input.onDenied();
  }, [input.onDenied, review.denied]);
  return (
    <div role="group" aria-label="Review category schedule" className="flex flex-col gap-md">
      <h4 className="text-section">
        {review.action.kind === 'create'
          ? 'Schedule a category change'
          : review.action.kind === 'edit'
            ? 'Edit category schedule'
            : 'Cancel category schedule'}
      </h4>
      <p>
        Reviewed category: {review.reviewed.data.label} ·{' '}
        {review.reviewed.data.active ? 'Active' : 'Inactive'} · Last updated{' '}
        {clock.dateTime(review.reviewed.data.updatedAt)}
      </p>
      {review.action.kind !== 'create' ? (
        <p>
          Reviewed schedule version {review.action.schedule.version} ·{' '}
          {scheduleStatusLabels[review.action.schedule.status]}
        </p>
      ) : null}
      <Callout>
        {review.action.kind === 'cancel'
          ? 'Cancellation stops this pending action. It does not change the category state.'
          : 'This saves an absolute category state to apply at the selected time, even if the category changes in between. The current category snapshot is checked when you submit; current creator authority and event lifecycle are checked when the action runs.'}
      </Callout>
      <CategoryScheduleReviewFeedback review={review} accessAvailable={input.accessAvailable} />
      <CategoryScheduleReviewFields review={review} />
      <Button
        variant="quiet"
        disabled={!input.accessAvailable || review.locked || review.loading}
        onClick={input.onClose}
      >
        Back to category schedules
      </Button>
    </div>
  );
}
function CategoryScheduleReviewFeedback({
  review,
  accessAvailable,
}: {
  review: ReturnType<typeof useCategoryScheduleReview>;
  accessAvailable: boolean;
}) {
  const clock = useEventTime();
  if (review.mutation.isSuccess)
    return (
      <Callout role="status">
        <p>
          Category schedule request confirmed. Current status:{' '}
          {scheduleStatusLabels[review.mutation.data.schedule.status]} · Version{' '}
          {review.mutation.data.schedule.version}.
        </p>
        <p>
          Scheduled category: {review.mutation.data.schedule.active ? 'Active' : 'Inactive'} ·{' '}
          {clock.dateTime(review.mutation.data.schedule.scheduledFor)}
        </p>
      </Callout>
    );
  return (
    <>
      {review.error ? (
        <Callout tone="alert" role="alert">
          {review.error}
        </Callout>
      ) : null}
      {review.stale && !review.uncertain ? (
        <Callout tone="alert">Category, schedule or event clock changed after your review.</Callout>
      ) : null}
      {!review.uncertain && (review.stale || review.blocked) ? (
        <Button
          variant="secondary"
          disabled={!accessAvailable || review.loading}
          onClick={() => void review.reload()}
        >
          Review current category and schedule
        </Button>
      ) : null}
    </>
  );
}
