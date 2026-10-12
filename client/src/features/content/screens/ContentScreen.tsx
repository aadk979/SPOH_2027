'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAllows, useRequireSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { ApiError } from '@/shared/lib/apiErrors';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout, LoadingRows, Stack, ErrorState } from '@/shared/ui';
import { useContentDraft } from '../queries';
import { ContentEditor } from '../components/ContentEditor';
import { ContentPublishPanel } from '../components/ContentPublishPanel';
import { ContentVersions } from '../components/ContentVersions';
export default function ContentScreen(): ReactNode {
  const session = useRequireSession();
  const allows = useAllows();
  const editable = allows('Content.Edit');
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell title="Event guide and map" width="wide">
      <Stack>
        {!editable ? <Callout tone="info">Your role cannot edit the event guide.</Callout> : null}
        {editable ? <DraftOwner key={`${eventId}:${session.volunteerId}`} /> : null}
      </Stack>
    </AppShell>
  );
}

function DraftOwner() {
  const [denied, setDenied] = useState<Error | null>(null);
  const onAccessLost = useCallback((error: Error) => setDenied(error), []);
  return denied ? <ErrorState error={denied} operation="Loading the saved draft" /> : <DraftWorkspace onAccessLost={onAccessLost} />;
}

function DraftWorkspace({ onAccessLost }: { onAccessLost(error: Error): void }) {
  const draft = useContentDraft(true);
  useEffect(() => {
    if (draft.error instanceof ApiError && [401, 403, 404].includes(draft.error.status)) onAccessLost(draft.error);
  }, [draft.error, onAccessLost]);
  return <>
        {draft.isPending ? <LoadingRows /> : null}
        {draft.error ? (
          <ErrorState error={draft.error}><Button variant="secondary" onClick={() => void draft.refetch()}>
              Reload draft
            </Button></ErrorState>
        ) : null}
        {draft.data && !draft.error ? (
          <>
            <ContentEditor key={draft.data.version} draft={draft.data} />
            <ContentPublishPanel key={`publish-${draft.data.version}`} draft={draft.data} />
            <ContentVersions onAccessLost={onAccessLost} />
          </>
        ) : null}
    </>;
}
