import { z } from 'zod';
import { ImportFootfallRequest, ImportRegistrationsRequest } from '@spoh/shared';
import type { Source, Target } from './importTemplates';

export interface ImportValues {
  target: Target;
  source: Source;
  csv: string;
  fileName: string;
  notes: string;
}

export const EMPTY_IMPORT: ImportValues = {
  target: 'registrations',
  source: 'FALLBACK_SHEET',
  csv: '',
  fileName: '',
  notes: '',
};

/** The endpoint's own request schema, chosen by what is being imported. */
export const ImportFormRequest = z.discriminatedUnion('target', [
  z.object({ target: z.literal('registrations'), body: ImportRegistrationsRequest }),
  z.object({ target: z.literal('footfall'), body: ImportFootfallRequest }),
]);

/** Row errors belong to the CSV box the rows were parsed from. */
export const IMPORT_ERROR_FIELDS = {
  'body.rows': 'csv',
  'body.source': 'source',
  'body.fileName': 'fileName',
  'body.notes': 'notes',
} as const;

/** The request before schema validation; blank optional fields are omitted. */
export function toImportRequest(
  values: ImportValues,
  rows: Array<Record<string, unknown>>,
  commit: boolean,
) {
  return {
    target: values.target,
    body: {
      source: values.source,
      rows,
      commit,
      ...(values.fileName.trim() ? { fileName: values.fileName.trim() } : {}),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    },
  };
}
