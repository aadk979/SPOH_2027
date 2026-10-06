import type { CategoryScheduleRecord } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout } from '@/shared/ui';
import { scheduleErrorLabels, scheduleStatusLabels } from '../model/copy';
import type { CategoryScheduleAction } from '../model/categoryScheduleReview';

export function CategoryScheduleRows({
  rows,
  disabled,
  onReview,
}: {
  rows: CategoryScheduleRecord[];
  disabled: boolean;
  onReview: (action: CategoryScheduleAction) => void;
}) {
  const clock = useEventTime();
  return (
    <>
      {!rows.length ? <p>No category schedules match this status.</p> : null}
      <ul aria-label="Category schedule results" className="flex flex-col gap-md">
        {rows.map((schedule) => (
          <li key={schedule.id}>
            <div
              className="flex flex-col gap-sm"
              role="group"
              aria-label={`${schedule.active ? 'Active' : 'Inactive'} category schedule`}
            >
              <p>
                Scheduled category: {schedule.active ? 'Active' : 'Inactive'} ·{' '}
                {clock.dateTime(schedule.scheduledFor)}
              </p>
              <p>
                {scheduleStatusLabels[schedule.status]} · Version {schedule.version} · Attempts{' '}
                {schedule.attempts}/{schedule.maxAttempts}
              </p>
              <p className="text-caption">
                {schedule.createdByYou ? 'Scheduled by you' : 'Scheduled by another manager'} ·
                Reviewed category: {schedule.expectedActive ? 'Active' : 'Inactive'} at{' '}
                {clock.dateTime(schedule.expectedUpdatedAt)}
              </p>
              <p className="break-words">Reason: {schedule.reason}</p>
              {schedule.lastError ? (
                <Callout tone="warn">{scheduleErrorLabels[schedule.lastError]}</Callout>
              ) : null}
              {schedule.status === 'PENDING' ? (
                <div className="flex flex-wrap gap-sm">
                  {schedule.createdByYou ? (
                    <Button
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => onReview({ kind: 'edit', schedule })}
                    >
                      Edit category schedule
                    </Button>
                  ) : null}
                  <Button
                    variant="quiet"
                    disabled={disabled}
                    onClick={() => onReview({ kind: 'cancel', schedule })}
                  >
                    Cancel category schedule
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
