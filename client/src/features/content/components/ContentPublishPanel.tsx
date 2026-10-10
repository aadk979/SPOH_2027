import { useState, type ReactNode } from 'react';
import type { ContentDraftRecord } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { Button, Callout, Card, CardTitle, Stack } from '@/shared/ui';
import { usePublishContent, useReviewContent } from '../queries';
import { ContentScheduleForm } from './ContentScheduleForm';
import { ContentPreview } from './ContentPreview';
export function ContentPublishPanel({ draft }: { draft: ContentDraftRecord }): ReactNode {
  const allows = useAllows();
  const review = useReviewContent();
  const publish = usePublishContent();
  const [confirm, setConfirm] = useState(false);
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
          <Button onClick={() => setConfirm(true)} variant="secondary">
            Publish reviewed draft
          </Button>
        )}
        {confirm ? (
          <Callout tone="warn">
            <p>Publish draft {draft.version} now?</p>
            <Button
              onClick={() =>
                publish.mutate(
                  { expectedVersion: draft.version },
                  { onSuccess: () => setConfirm(false) },
                )
              }
              disabled={publish.isPending}
            >
              Publish now
            </Button>
            <Button variant="quiet" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </Callout>
        ) : null}
        {reviewed ? <ContentScheduleForm version={draft.version} /> : null}
        {failure ? (
          <Callout tone="alert" role="alert">
            {failure.message}
          </Callout>
        ) : null}
        {publish.isSuccess ? <p role="status">Guide published.</p> : null}
      </Stack>
    </Card>
  );
}
