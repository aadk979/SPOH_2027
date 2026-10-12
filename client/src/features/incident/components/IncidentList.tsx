import { Button, EmptyState, LoadingRows, ErrorState } from '@/shared/ui';
import type { useIncidents } from '../queries';
import { IncidentRecordCard } from './IncidentRecordCard';

export function IncidentList({ query }: { query: ReturnType<typeof useIncidents> }) {
  if (query.isError)
    return (
      <ErrorState error={query.error} />
    );
  const pages = query.data?.pages;
  const records = pages?.flatMap((page) => page.data) ?? [];
  return (
    <>
      {query.isPending ? <LoadingRows /> : null}
      {records.map((incident) => (
        <IncidentRecordCard key={incident.id} incident={incident} />
      ))}
      {pages && records.length === 0 ? (
        <EmptyState title="No matching incidents">Change the status filter.</EmptyState>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load older incidents
        </Button>
      ) : null}
    </>
  );
}
