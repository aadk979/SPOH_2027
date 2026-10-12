'use client';
import { useSearchParams } from 'next/navigation';
import type { RecordsRequest } from '@spoh/shared';
import { useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, ButtonLink, CountHelp, ErrorState, LoadingRows, Stack } from '@/shared/ui';
import { recordsFromParams, routeInput } from '../model/routeInput';
import { useRecords } from '../queries';
import { RecordsContents } from '../components/RecordsContents';
import { WorkspaceReadBoundary } from '../components/WorkspaceReadBoundary';

export default function RecordsScreen() {
  const session = useRequireSession();
  const params = useSearchParams();
  const input = routeInput(() => recordsFromParams(params));
  if (!session) return null;
  return <AppShell title="Filtered records" back={{ href: '/home', label: 'Home' }}>
    {input.error ? <ErrorState error={input.error} operation="Opening these records" back={<ButtonLink href="/search">Search this event</ButtonLink>} /> :
      <WorkspaceReadBoundary operation="Loading these records"><RecordsRead request={input.data} /></WorkspaceReadBoundary>}
    <CountHelp />
  </AppShell>;
}

function RecordsRead({ request }: { request: RecordsRequest }) {
  const query = useRecords(request);
  if (query.error) return <ErrorState error={query.error} operation="Loading these records" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingRows label="Loading these records" />;
  return <Stack><RecordsContents pages={query.data.pages} />
    {query.hasNextPage ? <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
      {query.isFetchingNextPage ? 'Loading older records…' : 'Load older records'}
    </Button> : null}
  </Stack>;
}
