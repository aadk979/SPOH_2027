import type { Dispatch, SetStateAction } from 'react';
import type { ImportResponse } from '@spoh/shared';
import type { Target, Source } from '../model/importTemplates';
import { ApiError } from '@/shared/lib/apiErrors';
import { importFallback } from '../api';
import { parseCsv } from '../model/parseImportCsv';
interface ImportAction {
  csv: string;
  target: Target;
  source: Source;
  fileName: string;
  notes: string;
  setPending: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setResult: Dispatch<SetStateAction<ImportResponse | null>>;
  setPreview: Dispatch<SetStateAction<ImportResponse | null>>;
}
export function useRunImport({
  csv,
  target,
  source,
  fileName,
  notes,
  setPending,
  setError,
  setResult,
  setPreview,
}: ImportAction) {
  async function run(commit: boolean): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const rows = parseCsv(csv, target);

      if (rows.length === 0) {
        setError('No rows parsed. Check the header line matches the template.');
        return;
      }

      const response = await importFallback(target, {
        source,
        rows,
        commit,
        ...(fileName.trim() ? { fileName: fileName.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });

      if (commit) {
        setResult(response);
        setPreview(null);
      } else {
        setPreview(response);
        setResult(null);
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? `${cause.message} (${cause.code})`
          : cause instanceof Error
            ? cause.message
            : 'The import failed.',
      );
    } finally {
      setPending(false);
    }
  }

  return run;
}
