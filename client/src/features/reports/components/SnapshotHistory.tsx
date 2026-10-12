import { useCallback, useState } from 'react';
import { useAllows, useCurrentSession, useEventTime } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { Button, Callout, LoadingRows, Section, ErrorState } from '@/shared/ui';
import { useReportSnapshots, useReportSnapshot, useSnapshotDownload } from '../queries';
import { ReportTotals } from './ReportTotals';
import { usePrivateReadFailure } from '@/shared/hooks/usePrivateReadFailure';
export function SnapshotHistory() {
  const allows = useAllows();
  const session = useCurrentSession();
  const eventId = useEventId();
  return session && allows('Report.Generate') ? (
    <SnapshotOwner key={`${eventId}:${session.volunteerId}`} />
  ) : null;
}
function SnapshotOwner() {
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  return denied ? (
    <Callout role="alert">Report history access is unavailable. Reload your session.</Callout>
  ) : (
    <SnapshotReader onDenied={onDenied} />
  );
}
function SnapshotReader({ onDenied }: { onDenied(): void }) {
  const [id, select] = useState('');
  const list = useReportSnapshots(true);
  usePrivateReadFailure(list.error, onDenied);
  return (
    <Section title="Frozen report history">
      <p>
        Each snapshot retains the counts and configuration at its recorded time. Later corrections
        do not rewrite it.
      </p>
      {list.isPending ? <LoadingRows /> : null}
      {list.error ? (
        <ErrorState error={list.error}><Button onClick={() => void list.refetch()}>Retry history</Button></ErrorState>
      ) : null}
      {!list.error ? <SnapshotList list={list} onSelect={select} /> : null}
      {id && !list.error ? <SelectedSnapshot key={id} id={id} onDenied={onDenied} /> : null}
    </Section>
  );
}
function SnapshotList({
  list,
  onSelect,
}: {
  list: ReturnType<typeof useReportSnapshots>;
  onSelect(id: string): void;
}) {
  const time = useEventTime();
  return (
    <>
      {list.data?.pages
        .flatMap((page) => page.data)
        .map((snapshot) => (
          <Button key={snapshot.id} variant="quiet" onClick={() => onSelect(snapshot.id)}>
            {snapshot.kind} · {time.dateTime(snapshot.createdAt)}
            {snapshot.supersededAt ? ' · superseded' : ''}
            {snapshot.rehearsalIncluded ? ' · includes rehearsal' : ''}
          </Button>
        ))}
      {list.data?.pages[0]?.data.length === 0 ? (
        <p>No frozen reports yet. Schedule a snapshot or close the event to create one.</p>
      ) : null}
      {list.hasNextPage ? (
        <Button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          Load older snapshots
        </Button>
      ) : null}
    </>
  );
}
function SelectedSnapshot({ id, onDenied }: { id: string; onDenied(): void }) {
  const allows = useAllows();
  const report = useReportSnapshot(id);
  const download = useSnapshotDownload();
  usePrivateReadFailure(report.error ?? download.error, onDenied);
  return (
    <>
      {report.isPending ? <LoadingRows /> : null}
      {report.error ? <ErrorState error={report.error} /> : null}
      {report.data && !report.error ? (
        <>
          <ReportTotals data={report.data} />
          {allows('Report.Export') ? (
            <>
              {(['csv', 'xlsx'] as const).map((format) => (
                <Button
                  key={format}
                  disabled={download.isPending}
                  onClick={() => download.mutate({ id, format })}
                >
                  Download frozen {format.toUpperCase()}
                </Button>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      {download.error ? <ErrorState error={download.error} /> : null}
    </>
  );
}
