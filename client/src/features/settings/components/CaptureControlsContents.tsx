import { useEffect, useState } from 'react';
import type { ScopedSettingsReadResponse, ScopedSettingsTarget } from '@spoh/shared';
import { Button, Callout, LoadingRows } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';
import { useScopedCaptureCurrent } from '../queries';
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
  const current = useScopedCaptureCurrent(target);
  const readDenied = current.error instanceof ApiError && [401, 403].includes(current.error.status);
  useEffect(() => {
    if (readDenied) onLockChange(false);
  }, [readDenied, onLockChange]);
  async function reload() {
    const result = await current.refetch();
    return result.isError ? null : (result.data ?? null);
  }
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
    />
  );
}
function CaptureControlsValues(input: {
  current: ScopedSettingsReadResponse;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onLockChange: (locked: boolean) => void;
  readUnavailable: boolean;
}) {
  const [action, setAction] = useState<CaptureAction | null>(null);
  const [denied, setDenied] = useState(false);
  const row = captureRow(input.current);
  const archived = input.current.eventStatus === 'ARCHIVED';
  if (denied)
    return (
      <Callout tone="alert" role="alert">
        Capture settings access is unavailable. Reload your session.
      </Callout>
    );
  return (
    <div className="flex flex-col gap-md">
      <CaptureControlsSummary {...input} />
      {action ? (
        <CaptureChangeReview
          key={JSON.stringify(action)}
          {...input}
          action={action}
          onDenied={() => setDenied(true)}
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
            onDenied={() => setDenied(true)}
          />
        </>
      )}
    </div>
  );
}
