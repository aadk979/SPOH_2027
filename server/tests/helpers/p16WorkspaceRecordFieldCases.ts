import frozen from '../fixtures/p16-workspace-record-field-cases.json' with { type: 'json' };
import { z } from 'zod';

export interface WorkspaceRecordFieldCase {
  id: string;
  route: 'records';
  kind?: string;
  query: Record<string, string | string[]>;
}
interface Corpus {
  invalid: WorkspaceRecordFieldCase[];
  valid: WorkspaceRecordFieldCase[];
  recordKinds: string[];
}
interface Input {
  stationId: string;
  giftTypeId: string;
  personId: string;
  now: string;
}
const queryCase = z
  .object({
    id: z.string(),
    route: z.literal('records'),
    kind: z.string().optional(),
    query: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  })
  .strict();
// Check the static transport descriptor shape, independently of application validation.
const descriptors: Corpus = z
  .object({
    invalid: z.array(queryCase),
    valid: z.array(queryCase),
    recordKinds: z.array(z.string()),
  })
  .strict()
  .parse(frozen);

/** Freeze constraints independently of the schema; hydrate only fixture values. */
export function workspaceRecordFieldCases(input: Input): Corpus {
  const values = new Map([
    ['$STATION', input.stationId],
    ['$GIFT', input.giftTypeId],
    ['$PERSON', input.personId],
    ['$NOW', input.now],
  ]);
  const replace = (value: string) => values.get(value) ?? value;
  const hydrate = (row: WorkspaceRecordFieldCase): WorkspaceRecordFieldCase => ({
    ...row,
    query: Object.fromEntries(
      Object.entries(row.query).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(replace) : replace(value),
      ]),
    ),
  });
  return {
    invalid: descriptors.invalid.map(hydrate),
    valid: descriptors.valid.map(hydrate),
    recordKinds: [...descriptors.recordKinds],
  };
}
