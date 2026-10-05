import { useEffect, useState } from 'react';
import type { ScopedSettingsHistoryRecord, ScopedSettingsReadResponse } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout, Card, LoadingRows } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';
import { useScopedCaptureHistory } from '../queries';
import { captureRow, captureValue } from '../model/captureControl';
import { settingSourceLabels } from '../model/productHistory';

type HistoryInput = {
  current: ScopedSettingsReadResponse;
  disabled: boolean;
  onReview: (history: ScopedSettingsHistoryRecord) => void;
  onDenied: () => void;
};
export function CaptureHistoryPanel(input: HistoryInput) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-md">
      <Button
        variant="secondary"
        className="hover:bg-surface"
        aria-expanded={expanded}
        aria-controls="capture-setting-history"
        onClick={() => setExpanded(!expanded)}
      >
        Capture history and restore
      </Button>
      {expanded ? (
        <div id="capture-setting-history">
          <CaptureHistoryContents {...input} />
        </div>
      ) : null}
    </div>
  );
}
function CaptureHistoryContents(input: HistoryInput) {
  const history = useScopedCaptureHistory(input.current.target);
  const clock = useEventTime();
  const denied = history.error instanceof ApiError && [401, 403].includes(history.error.status);
  useEffect(() => {
    if (denied) input.onDenied();
  }, [denied, input.onDenied]);
  const reload = (
    <Button
      variant="quiet"
      disabled={history.isFetching}
      onClick={() => {
        void history.refetch();
      }}
    >
      Reload capture history
    </Button>
  );
  if (history.isError)
    return (
      <div className="flex flex-col gap-md">
        {reload}
        <Callout tone="alert" role="alert">
          Capture history is unavailable. Reload before reviewing a restore.
        </Callout>
      </div>
    );
  if (!history.data) return <LoadingRows />;
  const rows = history.data.pages.flatMap((page) => page.data);
  return (
    <div className="flex flex-col gap-md">
      {reload}
      <p className="text-caption text-ink-muted">
        History checked {clock.dateTime(history.data.pages[0]?.evaluatedAt)} on the event clock.
      </p>
      {!rows.length ? <p>No capture history at this scope yet.</p> : null}
      <ul aria-label="Capture history results" className="flex flex-col gap-md">
        {rows.map((row) => (
          <CaptureHistoryRow
            key={row.id}
            row={row}
            alreadyInherited={captureRow(input.current).storedVersion === 0}
            disabled={
              input.disabled ||
              history.isFetching ||
              (row.values.available &&
                row.values.operation === 'reset' &&
                captureRow(input.current).storedVersion === 0)
            }
            onReview={input.onReview}
          />
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button
          variant="secondary"
          className="hover:bg-surface"
          disabled={history.isFetching}
          onClick={() => {
            void history.fetchNextPage();
          }}
        >
          Load more capture history
        </Button>
      ) : null}
    </div>
  );
}
function CaptureHistoryRow(input: {
  row: ScopedSettingsHistoryRecord;
  disabled: boolean;
  alreadyInherited: boolean;
  onReview: (row: ScopedSettingsHistoryRecord) => void;
}) {
  const clock = useEventTime();
  const { row } = input;
  return (
    <li>
      <Card className="flex flex-col gap-sm">
        <p className="text-section">
          Version {row.version} ·{' '}
          {row.source === 'RESET' ? 'Override removed' : settingSourceLabels[row.source]}
        </p>
        <p className="text-caption text-ink-muted">
          {clock.dateTime(row.createdAt)}
          {row.createdByYou ? ' · Changed by you' : ''}
        </p>
        {row.values.available ? (
          <>
            <p>Before: {captureValue(row.values.before)}</p>
            {row.values.operation === 'set' ? (
              <p>After: {captureValue(row.values.after)}</p>
            ) : (
              <p>Override removed. Restoring this record uses current inheritance.</p>
            )}
          </>
        ) : (
          <p>This historical capture value is unavailable.</p>
        )}
        {row.reason ? <p className="break-words">Reason: {row.reason}</p> : null}
        {input.alreadyInherited && row.values.available && row.values.operation === 'reset' ? (
          <p>This scope already inherits a value. There is no override to remove.</p>
        ) : null}
        {row.values.available ? (
          <Button
            variant="secondary"
            className="hover:bg-surface"
            disabled={input.disabled}
            onClick={() => input.onReview(row)}
          >
            Review capture version {row.version}
          </Button>
        ) : null}
      </Card>
    </li>
  );
}
