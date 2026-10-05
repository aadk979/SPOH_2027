import { useEffect } from 'react';
import {
  GENERATED_SETTING_METADATA as metadata,
  type ScopedOperationalSettingKey,
  type ScopedSettingsHistoryRecord,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout, Card, LoadingRows } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';
import { useScopedSettingHistory } from '../queries';
import { catalogueValue } from '../model/operationalCatalogue';
import { settingSourceLabels } from '../model/productHistory';

export function OperationalCatalogueHistory(input: {
  target: ScopedSettingsTarget;
  settingKey: ScopedOperationalSettingKey;
  onDenied: () => void;
}) {
  const history = useScopedSettingHistory({ target: input.target, key: input.settingKey });
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
      Reload catalogue history
    </Button>
  );
  if (history.isError)
    return (
      <div className="flex flex-col gap-md">
        {reload}
        <Callout tone="alert" role="alert">
          Catalogue history is unavailable.
        </Callout>
      </div>
    );
  if (!history.data) return <LoadingRows />;
  const rows = history.data.pages.flatMap((page) => page.data);
  return (
    <section aria-label="Catalogue history" className="flex flex-col gap-md">
      <h2 className="text-section">History: {metadata[input.settingKey].label}</h2>
      {reload}
      <p className="text-caption text-ink-muted">
        History checked {clock.dateTime(history.data.pages[0]?.evaluatedAt)} on the event clock.
      </p>
      {!rows.length ? <p>No recorded changes for this setting at this scope.</p> : null}
      <ul aria-label="Catalogue history results" className="flex flex-col gap-md">
        {rows.map((row) => (
          <CatalogueHistoryRow key={row.id} row={row} />
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={history.isFetching}
          onClick={() => {
            void history.fetchNextPage();
          }}
        >
          Load more catalogue history
        </Button>
      ) : null}
    </section>
  );
}
function CatalogueHistoryRow({ row }: { row: ScopedSettingsHistoryRecord }) {
  const clock = useEventTime();
  return (
    <li>
      <Card className="flex flex-col gap-sm">
        <h3 className="text-section">
          Version {row.version} ·{' '}
          {row.source === 'RESET' ? 'Override removed' : settingSourceLabels[row.source]}
        </h3>
        <p className="text-caption text-ink-muted">
          {clock.dateTime(row.createdAt)}
          {row.createdByYou ? ' · Changed by you' : ''}
        </p>
        {row.values.available ? (
          <>
            <p className="break-words">Before: {catalogueValue(row.key, row.values.before)}</p>
            {row.values.operation === 'set' ? (
              <p className="break-words">After: {catalogueValue(row.key, row.values.after)}</p>
            ) : (
              <p>Override removed. The inherited value at that time is not recorded.</p>
            )}
          </>
        ) : (
          <p>This historical value is unavailable.</p>
        )}
        {row.reason ? <p className="break-words">Reason: {row.reason}</p> : null}
      </Card>
    </li>
  );
}
