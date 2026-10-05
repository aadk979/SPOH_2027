import { useEffect, useState } from 'react';
import type { ScopedSettingsReadResponse, ScopedSettingsTarget } from '@spoh/shared';
import { Button, Callout, LoadingRows } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';
import { useScopedSettingsCurrent, useScopedSettingsCache } from '../queries';
import { CaptureScheduleControls } from '@/features/schedule';
import { captureRow, type CaptureAction } from '../model/captureControl';
import { CaptureChangeReview } from './CaptureChangeReview';
import { CaptureHistoryPanel } from './CaptureHistoryPanel';
import { CaptureControlsSummary } from './CaptureControlsSummary';

export function CaptureControlsContents({
  target,
  onLockChange,
}: {
  target: ScopedSettingsTarget;
  onLockChange: (locked: boolean) => void;
}) {
  const [denied, setDenied] = useState(false);
  const current = useScopedSettingsCurrent(target, !denied);
  const readDenied = current.error instanceof ApiError && [401, 403].includes(current.error.status);
  useEffect(() => {
    if (readDenied || denied) onLockChange(false);
  }, [readDenied, denied, onLockChange]);
  async function reload() {
    const result = await current.refetch();
    return result.isError ? null : (result.data ?? null);
  }
  if (denied)
    return (
      <Callout tone="alert" role="alert">
        Capture settings access is unavailable. Reload your session.
      </Callout>
    );
  if (current.isError && (!current.data || readDenied))
    return (
      <Callout tone="alert" role="alert">
        Capture settings are unavailable.{' '}
        <Button
          variant="quiet"
          onClick={() => {
            void reload();
          }}
        >
          Reload capture settings
        </Button>
      </Callout>
    );
  if (!current.data) return <LoadingRows />;
  return (
    <CaptureControlsValues
      current={current.data}
      loadCurrent={reload}
      onLockChange={onLockChange}
      readUnavailable={current.isError}
      onDenied={() => setDenied(true)}
    />
  );
}
function CaptureControlsValues(input: {
  current: ScopedSettingsReadResponse;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onLockChange: (locked: boolean) => void;
  readUnavailable: boolean;
  onDenied: () => void;
}) {
  const [action, setAction] = useState<CaptureAction | null>(null);
  const [schedules, setSchedules] = useState(false);
  const scheduleSettings = useScopedSettingsCache();
  const row = captureRow(input.current);
  const archived = input.current.eventStatus === 'ARCHIVED';
  return (
    <div className="flex flex-col gap-md">
      <CaptureControlsSummary {...input} />
      {schedules ? (
        <CaptureScheduleControls
          {...input}
          onApplied={scheduleSettings.accept}
          onClose={() => setSchedules(false)}
          onDenied={() => {
            scheduleSettings.clear();
            input.onDenied();
          }}
        />
      ) : action ? (
        <CaptureChangeReview
          key={JSON.stringify(action)}
          {...input}
          action={action}
          onDenied={input.onDenied}
          onClose={() => setAction(null)}
        />
      ) : (
        <>
          <Button
            disabled={archived || input.readUnavailable}
            onClick={() => setAction({ operation: 'set', value: row.value !== true })}
          >
            {row.value === true ? 'Review pause' : 'Review opening'}
          </Button>
          <Button
            variant="secondary"
            className="hover:bg-surface"
            disabled={archived || input.readUnavailable || row.storedVersion === 0}
            onClick={() => setAction({ operation: 'reset' })}
          >
            Review removing override
          </Button>
          <CaptureHistoryPanel
            {...input}
            disabled={archived || input.readUnavailable}
            onReview={(history) => setAction({ operation: 'restore', history })}
            onDenied={input.onDenied}
          />
          <Button
            variant="secondary"
            disabled={input.readUnavailable}
            onClick={() => setSchedules(true)}
          >
            Capture schedules
          </Button>
        </>
      )}
    </div>
  );
}
