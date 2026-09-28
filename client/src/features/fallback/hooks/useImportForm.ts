import { useState } from 'react';
import type { ImportResponse } from '@spoh/shared';
import type { Target, Source } from '../model/importTemplates';
import { useRunImport } from './useRunImport';
export function useImportForm() {
  const [target, setTarget] = useState<Target>('registrations');
  const [source, setSource] = useState<Source>('FALLBACK_SHEET');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Any change to what is being imported invalidates the dry run. */
  function invalidatePreview(): void {
    setPreview(null);
    setResult(null);
  }

  const run = useRunImport({
    csv,
    target,
    source,
    fileName,
    notes,
    setPending,
    setError,
    setResult,
    setPreview,
  });
  return {
    target,
    setTarget,
    source,
    setSource,
    csv,
    setCsv,
    fileName,
    setFileName,
    notes,
    setNotes,
    preview,
    result,
    error,
    pending,
    run,
    invalidatePreview,
  };
}
export type ImportForm = ReturnType<typeof useImportForm>;
