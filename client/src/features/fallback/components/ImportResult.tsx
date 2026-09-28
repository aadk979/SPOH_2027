import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { Card, CardTitle } from '@/shared/ui';
export function ImportResult({ form }: { form: ImportForm }): ReactNode {
  const { result } = form;
  if (!result) return null;
  return (
    <Card tone="ok" as="section" aria-live="polite">
      <CardTitle>Imported</CardTitle>
      <p className="mt-xs">
        {result.recordsCreated} record{result.recordsCreated === 1 ? '' : 's'} created,{' '}
        {result.recordsSkipped} already present.
      </p>
      <p className="mt-xs text-caption text-text-muted">
        Tagged <strong>{result.source}</strong>. Re-running the same rows is safe — nothing will be
        duplicated.
      </p>
    </Card>
  );
}
