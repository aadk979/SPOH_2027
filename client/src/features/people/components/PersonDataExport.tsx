import type { ReactNode } from 'react';
import { Button, Callout, Stack } from '@/shared/ui';
import { useExportPersonData } from '../queries';
export function PersonDataExport({ id }: { id: string }): ReactNode {
  const exportData = useExportPersonData();
  function download(): void {
    exportData.mutate(id, { onSuccess: (response) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `person-${id}-data.json`; anchor.click(); URL.revokeObjectURL(url);
    } });
  }
  return <Stack><p>For a verified personal data request, download this person’s stored profile and activity references. The file contains personal information.</p>
    <Button variant="secondary" disabled={exportData.isPending} onClick={download}>Download personal data</Button>
    {exportData.error ? <Callout role="alert" tone="alert">{exportData.error.message}</Callout> : null}
    {exportData.data ? <p role="status">Downloaded. {exportData.data.retained.join(' ')}</p> : null}
  </Stack>;
}
