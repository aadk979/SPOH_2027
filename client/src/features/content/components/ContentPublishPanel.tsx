import { useState, type ReactNode } from 'react';
import type { ContentDraftRecord } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { Button, Card, CardTitle, ConfirmationDialog, MutationFeedback, Stack, useToast } from '@/shared/ui';
import { usePublishContent, useReviewContent } from '../queries';
import { ContentScheduleForm } from './ContentScheduleForm';
import { ContentPreview } from './ContentPreview';
export function ContentPublishPanel({ draft }: { draft: ContentDraftRecord }): ReactNode {
  const allows = useAllows();
  const review = useReviewContent();
  const publish = usePublishContent();
  const [confirmedVersion, setConfirmedVersion] = useState<number | null>(null);
  const announce = useToast();
  const failure = review.error ?? publish.error;
  if (!draft.body || !allows('Content.Publish')) return null;
  const reviewed = draft.reviewedVersion === draft.version;
  return (
    <Card>
      <Stack>
        <CardTitle>Make this guide available</CardTitle>
        <p>
          {reviewed
            ? `Draft ${draft.version} is reviewed.`
            : `Review draft ${draft.version} before publishing.`}
        </p>
        <p>
          Publishing makes this version available to every volunteer, including their offline copy.
        </p>
        <p>Only the saved draft is published. Save your edits, then review the new version.</p>
        <details><summary className="cursor-pointer font-semibold">Saved draft {draft.version} to publish</summary>
          <ContentPreview body={draft.body} />
        </details>
        {!reviewed ? (
          <Button
            onClick={() => review.mutate({ expectedVersion: draft.version })}
            disabled={review.isPending}
          >
            Confirm reviewed draft {draft.version}
          </Button>
        ) : (
          <Button onClick={() => setConfirmedVersion(draft.version)} variant="secondary">
            Publish reviewed draft
          </Button>
        )}
        <ConfirmationDialog open={confirmedVersion !== null} title="Publish reviewed guide" confirmLabel="Publish now" pending={publish.isPending}
          onCancel={() => setConfirmedVersion(null)} onConfirm={() => {
            if (confirmedVersion === null) return;
            publish.mutate({ expectedVersion: confirmedVersion }, { onSuccess: () => { setConfirmedVersion(null); announce('Reviewed guide published.'); } });
          }}>
          <p>Publish saved draft {confirmedVersion} to every volunteer, including their offline copy?</p>
          <MutationFeedback error={publish.error} operation="Publishing the guide" />
        </ConfirmationDialog>
        {reviewed ? <ContentScheduleForm version={draft.version} /> : null}
        <MutationFeedback error={failure} pending={review.isPending || publish.isPending} saved={publish.isSuccess} operation="Publishing the guide" success="Guide published." />
      </Stack>
    </Card>
  );
}
