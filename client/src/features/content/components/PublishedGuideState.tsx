import type { ReactNode } from 'react';
import type { PublishedContentRecord } from '@spoh/shared';
import { Button, Callout, LoadingRows, Stack } from '@/shared/ui';
import { usePublishedContent } from '../queries';
import { useOnline } from '@/shared/hooks/useOnline';
export function PublishedGuideState({
  children,
}: {
  children(record: PublishedContentRecord): ReactNode;
}): ReactNode {
  const content = usePublishedContent();
  const online = useOnline();
  if (content.isPending) return <LoadingRows />;
  if (!content.data)
    return (
      <Callout tone="info">
        <p>The published guide is unavailable. Ask your IC for the current briefing.</p>
        <Button variant="secondary" onClick={() => void content.refetch()}>
          Try again
        </Button>
      </Callout>
    );
  return (
    <Stack>
      {content.data.offline || !online ? (
        <Callout tone="warn" role="status">
          Offline copy · published version {content.data.record.version}. Connect to check for
          updates.
        </Callout>
      ) : null}
      {children(content.data.record)}
    </Stack>
  );
}
