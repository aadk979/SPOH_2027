import { useState } from 'react';
import type { ImportResponse } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { EMPTY_IMPORT, IMPORT_ERROR_FIELDS, ImportFormRequest } from '../model/importRequest';
import { useRunImport } from './useRunImport';
import { useFallbackWindows } from '../queries';
import type { ImportValues } from '../model/importRequest';
export function useImportForm(enabled: boolean) {
  const form = useZodForm(ImportFormRequest, EMPTY_IMPORT, IMPORT_ERROR_FIELDS);
  const windows = useFallbackWindows(enabled);
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

  function setter<Key extends keyof ImportValues>(key: Key) {
    return (value: ImportValues[Key]) => {
      form.setField(key, value);
      if (key === 'source') form.setField('fallbackWindowId', '');
      invalidatePreview();
      setError(null);
    };
  }

  const run = useRunImport({
    values: form.values,
    preview,
    windows: windows.data ?? [],
    validate: form.validate,
    setPending,
    setError,
    setOutcome,
  });
  return {
    ...form.values,
    errors: form.errors,
    setTarget: setter('target'),
    setSource: setter('source'),
    setCsv: setter('csv'),
    setFileName: setter('fileName'),
    setNotes: setter('notes'),
    setFallbackWindowId: setter('fallbackWindowId'),
    windows,
    preview,
    result,
    error,
    pending,
    run,
  };
}
export type ImportForm = ReturnType<typeof useImportForm>;
