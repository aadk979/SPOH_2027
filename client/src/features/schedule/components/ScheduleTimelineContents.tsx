import { Button, Callout, LoadingRows } from '@/shared/ui';
import { useEventTime } from '@/features/session';
import type { ScheduledActionStatus, ScheduleTimelineResponse } from '@spoh/shared';
import { useScheduleTimeline } from '../queries';
import { ScheduleTimelineRow } from './ScheduleTimelineRow';

export function ScheduleTimelineContents({ status }: { status?: ScheduledActionStatus }) {
  const timeline = useScheduleTimeline(true, status);
  return (
    <div className="flex flex-col gap-md">
      {timeline.isPending ? <LoadingRows /> : null}
      {timeline.isError ? (
        <Callout tone="alert" role="alert">
          Scheduled work is unavailable. Reload to check your access.
        </Callout>
      ) : null}
      <Button
        variant="quiet"
        disabled={timeline.isFetching}
        onClick={() => {
          void timeline.refetch();
        }}
      >
        Reload scheduled work
      </Button>
      {/* A denial hides every cached page, including reads made before a demotion. */}
      {!timeline.isError && timeline.data ? (
        <ScheduleTimelineResults pages={timeline.data.pages} />
      ) : null}
      {timeline.hasNextPage && !timeline.isError ? (
        <Button
          variant="quiet"
          disabled={timeline.isFetching}
          onClick={() => {
            void timeline.fetchNextPage();
          }}
        >
          Load more scheduled work
        </Button>
      ) : null}
    </div>
  );
}

function ScheduleTimelineResults({ pages }: { pages: ScheduleTimelineResponse[] }) {
  const format = useEventTime();
  const rows = [
    ...new Map(pages.flatMap((page) => page.data).map((row) => [row.id, row])).values(),
  ];
  return (
    <>
      {pages[0] ? (
        <p className="text-caption text-text-muted">
          Checked {format.dateTime(pages[0].evaluatedAt)} · Most recently created first
        </p>
      ) : null}
      {!rows.length ? <p>No scheduled work matches this status.</p> : null}
      <ul aria-label="Scheduled work results">
        {rows.map((row) => (
          <ScheduleTimelineRow key={row.id} row={row} />
        ))}
      </ul>
    </>
  );
}
