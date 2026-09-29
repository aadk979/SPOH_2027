import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { Field, Input } from '@/shared/ui';
export function ImportMetadataFields({ form }: { form: ImportForm }): ReactNode {
  const { fileName, setFileName, notes, setNotes } = form;
  return (
    <div className="grid gap-md sm:grid-cols-2">
      <Field id="file-name" label="File name" error={form.errors.fileName} optional>
        {(props) => (
          <Input
            {...props}
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="FALLBACK_Registration.csv"
          />
        )}
      </Field>

      <Field id="notes" label="Notes" error={form.errors.notes} optional>
        {(props) => (
          <Input
            {...props}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Transcribed by the Room A IC"
          />
        )}
      </Field>
    </div>
  );
}
