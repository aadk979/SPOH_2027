import { useEffect, useState, type ReactNode } from 'react';
import { useEventTime } from '@/features/session';
import { Button, Section, Stack, ErrorState } from '@/shared/ui';
import { useContentVersions } from '../queries';
import { ContentPreview } from './ContentPreview';
import { ApiError } from '@/shared/lib/apiErrors';
export function ContentVersions({ onAccessLost }: { onAccessLost?(error: Error): void } = {}): ReactNode {
  const versions = useContentVersions(true);
  const time = useEventTime();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (versions.error instanceof ApiError && [401, 403, 404].includes(versions.error.status)) onAccessLost?.(versions.error);
  }, [versions.error, onAccessLost]);
  const records = versions.error ? undefined : versions.data;
  const record = records?.find((version) => version.id === selected);
  return (
    <Section title="Published versions">
      <Stack>
        {versions.error ? (
          <ErrorState error={versions.error} />
        ) : null}
        {records?.length === 0 ? <p>No version has been published yet.</p> : null}
        {records?.map((version) => (
          <Button key={version.id} variant="quiet" onClick={() => setSelected(version.id)}>
            Version {version.version} · {time.dateTime(version.publishedAt)}
          </Button>
        ))}
        {record ? <ContentPreview body={record.body} /> : null}
      </Stack>
    </Section>
  );
}
