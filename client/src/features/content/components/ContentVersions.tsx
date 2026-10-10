import { useState, type ReactNode } from 'react';
import { useEventTime } from '@/features/session';
import { Button, Callout, Section, Stack } from '@/shared/ui';
import { useContentVersions } from '../queries';
import { ContentPreview } from './ContentPreview';
export function ContentVersions(): ReactNode {
  const versions = useContentVersions(true);
  const time = useEventTime();
  const [selected, setSelected] = useState<string | null>(null);
  const record = versions.data?.find((version) => version.id === selected);
  return (
    <Section title="Published versions">
      <Stack>
        {versions.error ? (
          <Callout tone="alert" role="alert">
            {versions.error.message}
          </Callout>
        ) : null}
        {versions.data?.length === 0 ? <p>No version has been published yet.</p> : null}
        {versions.data?.map((version) => (
          <Button key={version.id} variant="quiet" onClick={() => setSelected(version.id)}>
            Version {version.version} · {time.dateTime(version.publishedAt)}
          </Button>
        ))}
        {record ? <ContentPreview body={record.body} /> : null}
      </Stack>
    </Section>
  );
}
