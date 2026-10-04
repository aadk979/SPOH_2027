import type { EventSettingHistoryRecord } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Card } from '@/shared/ui';
import { productValueLabel, settingSourceLabels } from '../model/productHistory';

export function ProductHistoryRows(input: {
  rows: EventSettingHistoryRecord[];
  stations: ReadonlyArray<{ id: string; name: string }>;
  disabled: boolean;
  onReview: (row: EventSettingHistoryRecord) => void;
}) {
  const clock = useEventTime();
  return (
    <ul aria-label="Setting history results" className="flex flex-col gap-md">
      {input.rows.map((row) => (
        <li key={row.id}>
          <Card className="flex flex-col gap-sm">
            <p className="text-section">
              Version {row.version} · {settingSourceLabels[row.source]}
            </p>
            <p className="text-caption text-ink-muted">
              {clock.dateTime(row.createdAt)}
              {row.createdByYou ? ' · Changed by you' : ''}
            </p>
            {row.values.available ? (
              <>
                <p>Before: {productValueLabel(row.values.before, input.stations)}</p>
                <p>After: {productValueLabel(row.values.after, input.stations)}</p>
              </>
            ) : (
              <p>This historical value is unavailable.</p>
            )}
            {row.reason ? <p className="break-words">Reason: {row.reason}</p> : null}
            {row.values.available ? (
              <Button
                variant="secondary"
                className="hover:bg-surface"
                disabled={input.disabled}
                onClick={() => input.onReview(row)}
              >
                Review version {row.version}
              </Button>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
