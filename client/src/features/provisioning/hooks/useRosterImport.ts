import { useState } from 'react';
import { parseRosterCsv, RosterImportRequest, type RosterImportRow } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useImportPeople } from '../queries';

export function useRosterImport() {
  const form = useZodForm(RosterImportRequest, { csv: '' }, { rows: 'csv' });
  const importPeople = useImportPeople();
  const [review, setReview] = useState<{ text: string; rows: RosterImportRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  function change(text: string): void {
    form.setField('csv', text);
    setReview(null);
    setError(null);
    importPeople.reset();
  }
  function preview(): void {
    setReview(null);
    setError(null);
    try {
      const parsed = parseRosterCsv(form.values.csv);
      if (parsed.issues.length) {
        setError(
          parsed.issues
            .map((issue) => `Line ${issue.rowNumber}, ${issue.field}: ${issue.message}`)
            .join('\n'),
        );
        return;
      }
      const body = form.validate({ rows: parsed.rows, commit: false });
      if (body)
        importPeople.mutate(body, {
          onSuccess: (result) => {
            if (!result.issues.length) setReview({ text: form.values.csv, rows: parsed.rows });
          },
        });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the CSV.');
    }
  }
  function apply(): void {
    if (!review || review.text !== form.values.csv || importPeople.isPending) return;
    importPeople.mutate({ rows: review.rows, commit: true }, { onSuccess: () => setReview(null) });
  }
  return { form, change, preview, apply, error, review, importPeople };
}
