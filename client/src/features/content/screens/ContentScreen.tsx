'use client';
import type { ReactNode } from 'react';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout, LoadingRows, Stack } from '@/shared/ui';
import { useContentDraft } from '../queries';
import { ContentEditor } from '../components/ContentEditor';
import { ContentPublishPanel } from '../components/ContentPublishPanel';
import { ContentVersions } from '../components/ContentVersions';
export default function ContentScreen(): ReactNode {
  const session = useRequireSession();
  const allows = useAllows();
  const editable = allows('Content.Edit');
  const draft = useContentDraft(editable);
  if (!session) return null;
  return (
    <AppShell title="Event guide and map" width="wide">
      <Stack>
        {!editable ? <Callout tone="info">Your role cannot edit the event guide.</Callout> : null}
        {editable && draft.isPending ? <LoadingRows /> : null}
        {draft.error ? (
          <Callout tone="alert" role="alert">
            {draft.error.message}
            <Button variant="secondary" onClick={() => void draft.refetch()}>
              Reload draft
            </Button>
          </Callout>
        ) : null}
        {draft.data ? (
          <>
            <ContentEditor key={draft.data.version} draft={draft.data} />
            <ContentPublishPanel key={`publish-${draft.data.version}`} draft={draft.data} />
            <ContentVersions />
          </>
        ) : null}
      </Stack>
    </AppShell>
  );
}
