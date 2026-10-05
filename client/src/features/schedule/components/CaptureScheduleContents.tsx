import { useEffect, useState } from 'react';
import type { ScheduledActionStatus } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { Callout } from '@/shared/ui';
import { useCaptureSchedules, useClearCaptureSchedules } from '../queries';
import type { CaptureScheduleAction } from '../model/captureScheduleReview';
import type { CaptureScheduleControlsInput } from '../model/captureScheduleControls';
import { CaptureScheduleReview } from './CaptureScheduleReview';
import { CaptureScheduleCollection } from './CaptureScheduleCollection';

export function CaptureScheduleContents(
  input: CaptureScheduleControlsInput & { timezone: string },
) {
  const [status, setStatus] = useState<ScheduledActionStatus | undefined>();
  const [action, setAction] = useState<CaptureScheduleAction | null>(null);
  const query = useCaptureSchedules(input.current.target, status);
  const clear = useClearCaptureSchedules();
  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  useEffect(() => {
    if (denied) {
      clear();
      input.onLockChange(false);
      input.onDenied();
    }
  }, [denied, clear, input.onLockChange, input.onDenied]);
  const rows = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.data) ?? []).map((row) => [row.id, row]),
    ).values(),
  ];
  async function refreshSchedules() {
    const result = await query.refetch();
    if (result.isError) throw result.error;
  }
  function onDenied() {
    clear();
    input.onLockChange(false);
    input.onDenied();
  }
  if (denied) return <Callout tone="alert">Capture schedules access is unavailable.</Callout>;
  if (action)
    return (
      <CaptureScheduleReview
        {...input}
        onDenied={onDenied}
        refreshSchedules={refreshSchedules}
        action={action}
        latest={
          action.kind === 'create' ? undefined : rows.find((row) => row.id === action.schedule.id)
        }
        readUnavailable={input.readUnavailable || query.isError}
        onClose={() => {
          input.onLockChange(false);
          setAction(null);
        }}
      />
    );
  return (
    <CaptureScheduleCollection
      {...input}
      query={query}
      rows={rows}
      status={status}
      setStatus={setStatus}
      onReview={setAction}
    />
  );
}
