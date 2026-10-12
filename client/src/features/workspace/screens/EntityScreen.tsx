'use client';
import { useSearchParams } from 'next/navigation';
import type { EntityRef } from '@spoh/shared';
import { useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { ButtonLink, CountHelp, ErrorState, LoadingRows } from '@/shared/ui';
import { entityFromParams, routeInput } from '../model/routeInput';
import { useEntity } from '../queries';
import { EntityContents } from '../components/EntityContents';
import { WorkspaceReadBoundary } from '../components/WorkspaceReadBoundary';

export default function EntityScreen() {
  const session = useRequireSession();
  const params = useSearchParams();
  const input = routeInput(() => entityFromParams(params));
  if (!session) return null;
  return <AppShell title="Record detail" back={{ href: '/search', label: 'Search this event' }}>
    {input.error ? <ErrorState error={input.error} operation="Opening this record" back={<ButtonLink href="/search">Search this event</ButtonLink>} /> :
      <WorkspaceReadBoundary operation="Loading this record"><EntityRead refValue={input.data} /></WorkspaceReadBoundary>}
    <CountHelp />
  </AppShell>;
}

function EntityRead({ refValue }: { refValue: EntityRef }) {
  const query = useEntity(refValue);
  if (query.error) return <ErrorState error={query.error} operation="Loading this record" onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingRows label="Loading this record" />;
  return <EntityContents entity={query.data} />;
}
