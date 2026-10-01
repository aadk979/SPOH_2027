import { useState } from 'react';
import type { ImportResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { EMPTY_IMPORT, IMPORT_ERROR_FIELDS, ImportFormRequest } from '../model/importRequest';
import { useRunImport } from './useRunImport';
export function useImportForm() {
  const form = useZodForm(ImportFormRequest, EMPTY_IMPORT, IMPORT_ERROR_FIELDS);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Any change to what is being imported invalidates the dry run. */
  function invalidatePreview(): void {
    setPreview(null);
    setResult(null);
  }

  function setOutcome(commit: boolean, response: ImportResponse): void {
    setResult(commit ? response : null);
    setPreview(commit ? null : response);
  }

  const run = useRunImport({
    values: form.values,
    preview,
    validate: form.validate,
    setPending,
    setError,
    setOutcome,
  });
  return {
    ...form.values,
    errors: form.errors,
    setTarget: form.setter('target'),
    setSource: form.setter('source'),
    setCsv: form.setter('csv'),
    setFileName: form.setter('fileName'),
    setNotes: form.setter('notes'),
    preview,
    result,
    error,
    pending,
    run,
    invalidatePreview,
  };
}
export type ImportForm = ReturnType<typeof useImportForm>;
