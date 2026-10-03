import type { LifecycleReadinessResponse } from '@spoh/shared';
import { Button, Callout } from '@/shared/ui';
import { useLifecycleReview } from '../hooks/useLifecycleReview';
import { LifecycleTransitionFields } from './LifecycleTransitionFields';
import { LifecycleReadinessSummary } from './LifecycleReadinessSummary';

export function LifecycleReview({
  readiness,
  loadCurrent = async () => readiness,
}: {
  readiness: LifecycleReadinessResponse;
  loadCurrent?: () => Promise<LifecycleReadinessResponse | null>;
}) {
  const review = useLifecycleReview(readiness, loadCurrent);
  if (review.denied)
    return (
      <Callout tone="alert" role="alert">
        Lifecycle access is unavailable. Reload your session before trying again.
      </Callout>
    );
  return (
    <div className="flex flex-col gap-md">
      <LifecycleReadinessSummary readiness={review.reviewed} />
      {review.stale || review.saved ? (
        <>
          <Callout role={review.saved ? 'status' : 'alert'}>
            {review.saved
              ? 'Event state changed successfully.'
              : 'The event changed after your review.'}{' '}
            Review the current state before another change.
          </Callout>
          <Button
            variant="secondary"
            disabled={review.loading || review.mutation.isPending}
            onClick={() => {
              void review.reload();
            }}
          >
            Review current state
          </Button>
        </>
      ) : null}
      {review.error ? (
        <Callout tone="alert" role="alert">
          {review.error}
        </Callout>
      ) : null}
      <LifecycleTransitionFields review={review} />
    </div>
  );
}
