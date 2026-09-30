import type { Dispatch, SetStateAction } from 'react';
import type { ImportResponse } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { importFallback } from '../api';
import { parseCsv } from '../model/parseImportCsv';
import { toImportRequest, type ImportFormRequest, type ImportValues } from '../model/importRequest';
import type { z } from 'zod';
import { useEventId } from '@/shared/lib/eventContext';
interface ImportAction {
  values: ImportValues;
  validate(input: unknown): z.output<typeof ImportFormRequest> | null;
  setPending: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setOutcome(commit: boolean, response: ImportResponse): void;
}

function failureMessage(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.message} (${cause.code})`;
  return cause instanceof Error ? cause.message : 'The import failed.';
}

export function useRunImport({ values, validate, setPending, setError, setOutcome }: ImportAction) {
  const eventId = useEventId();
  async function run(commit: boolean): Promise<void> {
    setPending(true);
    setError(null);

    try {
      const rows = parseCsv(values.csv, values.target);

      if (rows.length === 0) {
        setError('No rows parsed. Check the header line matches the template.');
        return;
      }

      const request = validate(toImportRequest(values, rows, commit));
      if (!request) return;
      setOutcome(commit, await importFallback(eventId, request.target, request.body));
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return run;
}
