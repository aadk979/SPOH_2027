import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { Card, CardTitle, Callout, Button } from '@/shared/ui';
export function ImportPreview({ form }: { form: ImportForm }): ReactNode {
  const { preview, pending, run, source } = form;
  if (!preview) return null;
  return (
    <Card tone="info" as="section" aria-live="polite">
      <CardTitle>This is what would happen</CardTitle>

      <dl className="mt-sm grid grid-cols-[1fr_auto] gap-x-md gap-y-xxs">
        <dt>Rows read</dt>
        <dd className="text-right font-semibold tabular-nums">{preview.rowsRead}</dd>

        <dt>Records that would be created</dt>
        <dd className="text-right font-semibold tabular-nums">{preview.recordsCreated}</dd>

        <dt>Already imported, would be skipped</dt>
        <dd className="text-right font-semibold tabular-nums">{preview.recordsSkipped}</dd>
      </dl>

      {preview.issues.length > 0 ? (
        <Callout tone="warn" className="mt-md">
          <p className="font-semibold">
            {preview.issues.length} row{preview.issues.length === 1 ? '' : 's'} could not be read:
          </p>
          <ul className="mt-xxs flex flex-col gap-xxs text-caption">
            {preview.issues.slice(0, 10).map((issue) => (
              <li key={`${issue.rowNumber}:${issue.field}`}>
                Row {issue.rowNumber} — {issue.field}: {issue.message}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <Button
        size="lg"
        block
        className="mt-md"
        disabled={preview.recordsCreated === 0 || pending}
        onClick={() => void run(true)}
      >
        Import {preview.recordsCreated} record{preview.recordsCreated === 1 ? '' : 's'} as{' '}
        {source === 'PAPER' ? 'paper' : 'fallback sheet'}
      </Button>
    </Card>
  );
}
