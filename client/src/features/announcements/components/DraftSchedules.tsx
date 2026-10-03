import type {
  AnnouncementDraftRecord,
  AnnouncementPublicationScheduleRecord,
  MeResponse,
} from '@spoh/shared';
import { Button, Callout, Card, LoadingRows } from '@/shared/ui';
import { useAnnouncementSchedules } from '../queries';
import { ScheduleCreateForm } from './ScheduleCreateForm';
import { PublicationScheduleRow } from './PublicationScheduleRow';

export function DraftSchedules({ draft, me }: { draft: AnnouncementDraftRecord; me: MeResponse }) {
  const query = useAnnouncementSchedules(draft.id);
  const schedules = query.data?.pages.flatMap((page) => page.data) ?? [];
  const archived = me.event.status === 'ARCHIVED';
  const canCreate = scheduleCreationAllowed(draft, { archived, query, schedules });
  return (
    <Card as="section" className="flex flex-col gap-md">
      <h3 className="text-tagline">Draft publication schedule</h3>
      {query.hasNextPage ? (
        <p className="text-caption">
          Load remaining schedules before creating another publication.
        </p>
      ) : null}
      {canCreate ? (
        <ScheduleCreateForm
          key={`${draft.id}-${draft.version}`}
          draft={draft}
          timezone={me.event.timezone}
        />
      ) : null}
      <div className="flex flex-wrap gap-sm">
        <Button variant="quiet" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Reload schedule status
        </Button>
      </div>
      {query.isError ? (
        <Callout tone="alert" role="alert">
          Could not load schedules. Reload to try again.
        </Callout>
      ) : null}
      {query.isLoading ? (
        <LoadingRows count={2} label="Loading publication schedules" />
      ) : schedules.length === 0 ? (
        <p className="text-caption">No publication scheduled for this draft.</p>
      ) : (
        <ul className="flex flex-col gap-sm">
          {schedules.map((schedule) => (
            <PublicationScheduleRow
              key={`${schedule.id}-${schedule.version}`}
              draft={draft}
              schedule={schedule}
              timezone={me.event.timezone}
              archived={archived}
            />
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button
          variant="quiet"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load more schedules
        </Button>
      ) : null}
    </Card>
  );
}

function scheduleCreationAllowed(
  draft: AnnouncementDraftRecord,
  input: {
    archived: boolean;
    query: ReturnType<typeof useAnnouncementSchedules>;
    schedules: AnnouncementPublicationScheduleRecord[];
  },
) {
  const active = input.schedules.some(
    (schedule) => schedule.status === 'PENDING' || schedule.status === 'RUNNING',
  );
  return (
    !input.archived &&
    !draft.publishedAt &&
    input.query.isSuccess &&
    !input.query.hasNextPage &&
    !active
  );
}
