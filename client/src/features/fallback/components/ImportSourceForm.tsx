import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { Card, Button } from '@/shared/ui';
import { ImportSourceFields } from './ImportSourceFields';
import { ImportCsvFields } from './ImportCsvFields';
import { ImportMetadataFields } from './ImportMetadataFields';
export function ImportSourceForm({ form }: { form: ImportForm }): ReactNode {
  const { csv, pending, run } = form;
  return (
    <Card as="section" className="flex flex-col gap-lg">
      <ImportSourceFields form={form} />
      <ImportCsvFields form={form} />
      <ImportMetadataFields form={form} />

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
