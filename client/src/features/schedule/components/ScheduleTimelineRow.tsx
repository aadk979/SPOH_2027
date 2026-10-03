import type { ScheduleTimelineRecord } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { scheduleErrorLabels, scheduleKindLabels, scheduleStatusLabels } from '../model/copy';

export function ScheduleTimelineRow({ row }: { row: ScheduleTimelineRecord }) {
  const format = useEventTime();
  return (
    <li className="flex flex-col gap-xs border-t border-line py-md">
      <h3 className="font-semibold">{scheduleKindLabels[row.kind]}</h3>
      <p>{scheduleStatusLabels[row.status]}</p>
      <p className="text-caption text-text-muted">
        Scheduled for {format.dateTime(row.scheduledFor)}
      </p>
      {row.runAt !== row.scheduledFor ? (
        <p className="text-caption text-text-muted">
          {row.status === 'PENDING' || row.status === 'RUNNING'
            ? 'Next attempt'
            : 'Last attempt scheduled for'}{' '}
          {format.dateTime(row.runAt)}
        </p>
      ) : null}
      <p className="text-caption text-text-muted">
        Attempts {row.attempts} of {row.maxAttempts}
        {row.recurring ? ' · Repeats automatically' : ''}
      </p>
      {row.createdByYou ? <p className="text-caption text-text-muted">Scheduled by you</p> : null}
      {row.completedAt ? (
        <p className="text-caption text-text-muted">Finished {format.dateTime(row.completedAt)}</p>
      ) : null}
      {row.lastError ? <p>{scheduleErrorLabels[row.lastError]}</p> : null}
    </li>
  );
}
