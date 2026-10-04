import { useState } from 'react';
import type {
  EventSettingHistoryRecord,
  EventSettingKey,
  EventSettingsResponse,
} from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { useStations } from '@/features/stations';
import { Button, Callout, LoadingRows } from '@/shared/ui';
import { useProductHistory, useProductReviewCurrent } from '../queries';
import { ProductHistoryRows } from './ProductHistoryRows';
import { ProductRevertReview } from './ProductRevertReview';

export function ProductHistoryContents({ settingKey }: { settingKey: EventSettingKey }) {
  const history = useProductHistory(settingKey);
  const current = useProductReviewCurrent();
  const busy = history.isFetching || current.isFetching;
  async function reload() {
    const [list, values] = await Promise.all([history.refetch(), current.refetch()]);
    return list.isError || values.isError ? null : (values.data ?? null);
  }
  const reloadButton = (
    <Button
      variant="quiet"
      disabled={busy}
      onClick={() => {
        void reload();
      }}
    >
      Reload setting history
    </Button>
  );
  if (history.isError || current.isError)
    return (
      <div className="flex flex-col gap-md">
        {reloadButton}
        <Callout tone="alert" role="alert">
          Setting history is unavailable. Reload before making a change.
        </Callout>
      </div>
    );
  if (!history.data || !current.data) return <LoadingRows />;
  return <ProductHistoryResults history={history} current={current.data} loadCurrent={reload} />;
}
function ProductHistoryResults(input: {
  history: ReturnType<typeof useProductHistory>;
  current: EventSettingsResponse;
  loadCurrent: () => Promise<EventSettingsResponse | null>;
}) {
  const { history } = input;
  const stations = useStations();
  const clock = useEventTime();
  const [target, setTarget] = useState<EventSettingHistoryRecord | null>(null);
  if (!history.data) return null;
  const rows = history.data.pages.flatMap((page) => page.data);
  const busy = history.isFetching;
  return (
    <div className="flex flex-col gap-md">
      <Button
        variant="quiet"
        disabled={busy}
        onClick={() => {
          setTarget(null);
          void input.loadCurrent();
        }}
      >
        Reload setting history
      </Button>
      <p className="text-caption text-ink-muted">
        Checked {clock.dateTime(history.data.pages[0]?.evaluatedAt)} on the event clock.
      </p>
      {target ? (
        <ProductRevertReview
          key={target.id}
          target={target}
          current={input.current}
          stations={stations.data ?? []}
          loadCurrent={input.loadCurrent}
          onClose={() => setTarget(null)}
        />
      ) : (
        <>
          {!rows.length ? <p>No history for this setting yet.</p> : null}
          <ProductHistoryRows
            rows={rows}
            stations={stations.data ?? []}
            disabled={busy}
            onReview={setTarget}
          />
          {history.hasNextPage ? (
            <Button
              variant="secondary"
              className="hover:bg-surface"
              disabled={busy}
              onClick={() => {
                void history.fetchNextPage();
              }}
            >
              Load more setting history
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
