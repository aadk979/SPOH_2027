'use client';
import { useAllows, useCurrentSession } from '@/features/session';
import { Card, ErrorState, LoadingRows, PermissionDenied, Section } from '@/shared/ui';
import { useEvent } from '@/shared/lib/eventContext';
import { useBrandingState } from '../queries';
import { BrandingEditor } from './BrandingEditor';

export function BrandingPanel() {
  const event = useEvent();
  const session = useCurrentSession();
  const allows = useAllows();
  const query = useBrandingState();
  if (!session || !allows('Settings.Read')) return <PermissionDenied />;
  if (query.isError) return <ErrorState error={query.error} operation="Read branding" onRetry={() => void query.refetch()} />;
  return <Section title="Branding publication" description="Preview event logo variants and publish the identity used before sign-in. Clones start as a new draft.">
    <Card>{!query.data ? <LoadingRows /> : <BrandingEditor key={`${event.id}:${session.volunteerId}:${query.data.version}`} state={query.data} canEdit={event.status !== 'ARCHIVED' && allows('Content.Edit')} canPublish={event.status !== 'ARCHIVED' && allows('Content.Publish')} />}</Card>
  </Section>;
}
