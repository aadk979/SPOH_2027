import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { Card, Button } from '@/shared/ui';
import { ImportSourceFields } from './ImportSourceFields';
import { ImportCsvFields } from './ImportCsvFields';
import { ImportMetadataFields } from './ImportMetadataFields';
import { ImportWindowField } from './ImportWindowField';
export function ImportSourceForm({ form }: { form: ImportForm }): ReactNode {
  const { csv, pending, run } = form;
  return (
    <Card as="section" className="flex flex-col gap-lg">
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-lg">
        <ImportSourceFields form={form} />
        <ImportWindowField form={form} />
        <ImportCsvFields form={form} />
        <ImportMetadataFields form={form} />
      </fieldset>

      <Button
        size="lg"
        block
        disabled={csv.trim().length === 0 || pending}
        onClick={() => void run(false)}
      >
        {pending ? 'Working…' : 'Preview — writes nothing'}
      </Button>
    </Card>
  );
}
