import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { Field, Textarea, Button } from '@/shared/ui';
import { TEMPLATES } from '../model/importTemplates';
export function ImportCsvFields({ form }: { form: ImportForm }): ReactNode {
  const { csv, setCsv, error, target, invalidatePreview } = form;
  return (
    <>
      <Field
        id="csv"
        label="Rows (CSV)"
        hint="Times are ISO-8601 UTC. A 30-minute block start is enough — a tally sheet never had more precision than that, and pretending otherwise would invent it."
        error={form.errors.csv ?? error}
      >
        {(props) => (
          <Textarea
            {...props}
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              invalidatePreview();
            }}
            rows={8}
            spellCheck={false}
            placeholder={TEMPLATES[target]}
            // Monospace and no ligatures: this is transcribed data being
            // eyeballed against a sheet, and column alignment is how a
            // missing comma gets spotted.
            scale="mono"
          />
        )}
      </Field>

      <Button
        variant="quiet"
        size="sm"
        className="self-start"
        onClick={() => {
          setCsv(TEMPLATES[target]);
          invalidatePreview();
        }}
      >
        Insert the template
      </Button>
    </>
  );
}
