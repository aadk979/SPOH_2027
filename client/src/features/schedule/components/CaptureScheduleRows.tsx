import type { CaptureScheduleRecord } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout } from '@/shared/ui';
import { scheduleErrorLabels, scheduleStatusLabels } from '../model/copy';
import type { CaptureScheduleAction } from '../model/captureScheduleReview';

export function CaptureScheduleRows({
  rows,
  disabled,
  onReview,
}: {
  rows: CaptureScheduleRecord[];
  disabled: boolean;
  onReview: (action: CaptureScheduleAction) => void;
}) {
  const clock = useEventTime();
  return (
    <>
      {!rows.length ? <p>No capture schedules match this status.</p> : null}
      <ul aria-label="Capture schedule results" className="flex flex-col gap-md">
        {rows.map((schedule) => (
          <li
            key={schedule.id}
            className="flex flex-col gap-sm"
            role="group"
            aria-label={`${schedule.value ? 'Open' : 'Paused'} capture schedule`}
          >
            <p>
              Scheduled capture: {schedule.value ? 'Open' : 'Paused'} ·{' '}
              {clock.dateTime(schedule.scheduledFor)}
            </p>
            <p>
              {scheduleStatusLabels[schedule.status]} · Version {schedule.version} · Attempts{' '}
              {schedule.attempts}/{schedule.maxAttempts}
            </p>
            <p className="text-caption">
              {schedule.createdByYou ? 'Scheduled by you' : 'Scheduled by another manager'} ·
              Reviewed capture version {schedule.expectedVersion}
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
                    Edit capture schedule
                  </Button>
                ) : null}
                <Button
                  variant="quiet"
                  disabled={disabled}
                  onClick={() => onReview({ kind: 'cancel', schedule })}
                >
                  Cancel capture schedule
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
