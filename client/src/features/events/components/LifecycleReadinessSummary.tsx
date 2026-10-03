import type { LifecycleReadinessResponse } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Callout } from '@/shared/ui';
import { PHASE_LABELS, lifecycleBlocker, transitionLabel } from '../model/lifecycleCopy';

export function LifecycleReadinessSummary({
  readiness,
}: {
  readiness: LifecycleReadinessResponse;
}) {
  const time = useEventTime();
  return (
    <>
      <p className="text-body font-semibold">
        Reviewed state: {PHASE_LABELS[readiness.lifecycle.status]} · version{' '}
        {readiness.lifecycle.version}
      </p>
      <p className="text-caption text-text-muted">
        Readiness checked {time.dateTime(readiness.evaluatedAt)}. Readiness is checked again when
        you apply a change.
      </p>
      {readiness.reopenUntil ? (
        <p className="text-caption">
          Reopening deadline: {time.dateTime(readiness.reopenUntil)} on the event clock.
        </p>
      ) : null}
      <ul className="flex flex-col gap-sm" aria-label="Transition readiness">
        {readiness.transitions.map((option) => (
          <li key={option.to}>
            <p className="text-body font-semibold">
              {transitionLabel(readiness.lifecycle.status, option.to)}:{' '}
              {option.allowed ? 'Available' : 'Unavailable'}
            </p>
            {option.blockers.map((code) => (
              <p key={code} className="text-caption text-text-muted">
                {lifecycleBlocker(code)}
              </p>
            ))}
            {option.requiresReason ? (
              <p className="text-caption">A written reason is required.</p>
            ) : null}
          </li>
        ))}
      </ul>
      {!readiness.transitions.length ? (
        <Callout>This event has no available lifecycle transitions.</Callout>
      ) : null}
    </>
  );
}
