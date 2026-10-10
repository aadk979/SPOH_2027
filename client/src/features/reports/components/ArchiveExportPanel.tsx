import { useState, type ReactNode } from 'react';
import { useAllows, useEventTime } from '@/features/session';
import { useEvent } from '@/shared/lib/eventContext';
import { Button, Callout, Card, CardTitle, Stack } from '@/shared/ui';
import { useArchivePacks, useCreateArchivePack } from '../queries';
import { useArchivePackDownload } from '../hooks/useArchivePackDownload';
export function ArchiveExportPanel(): ReactNode {
  const event = useEvent();
  const allows = useAllows();
  const allowed = allows('Report.Export');
  const packs = useArchivePacks(allowed);
  const create = useCreateArchivePack();
  const time = useEventTime();
  const [review, setReview] = useState(false);
  const { failure, downloading, download } = useArchivePackDownload();
  if (!allowed) return null;
  const error = create.error ?? packs.error;
  return (
    <Card>
      <Stack>
        <CardTitle>After the event</CardTitle>
        <p>
          Close the event, settle lost and found, close fallback windows and prepare the final
          report. Then save an export pack before archiving.
        </p>
        <p>
          The frozen workbook includes the report and its counting notes. Visitor personal details
          are excluded.
        </p>
        {event.status === 'CLOSED' ? (
          <Button variant="secondary" onClick={() => setReview(true)}>
            Prepare archive export
          </Button>
        ) : null}
        {review ? (
          <Callout tone="warn">
            <p>Save the current frozen final report to the event’s export storage?</p>
            <Button
              disabled={create.isPending}
              onClick={() => create.mutate(undefined, { onSuccess: () => setReview(false) })}
            >
              Save export pack
            </Button>
            <Button variant="quiet" onClick={() => setReview(false)}>
              Cancel
            </Button>
          </Callout>
        ) : null}
        {packs.data?.map((pack) => (
          <Button
            key={pack.id}
            variant="quiet"
            disabled={downloading}
            onClick={() => void download(pack.id)}
          >
            Download pack · {time.dateTime(pack.createdAt)}
          </Button>
        ))}
        {error ? (
          <Callout tone="alert" role="alert">
            {error.message}
          </Callout>
        ) : null}
        {failure ? (
          <Callout tone="alert" role="alert">
            {failure}
          </Callout>
        ) : null}
        {create.isSuccess ? (
          <p role="status">Export pack saved. Check the Overview for archive readiness.</p>
        ) : null}
      </Stack>
    </Card>
  );
}
