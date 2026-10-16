import { ClaimLostFoundRequest, CreateLostFoundRequest, ListLostFoundQuery } from '@spoh/shared';
import type { ZodType } from 'zod';

/** Photo-shape refusals are separate from a future real uploaded-photo ownership case. */
export function lostFoundValidationCases({
  stationId,
  itemId,
  now,
}: {
  stationId: string;
  itemId: string;
  now: string;
}) {
  const definitions: Array<{
    name: string;
    path: string;
    schemaName: string;
    schema: ZodType;
    body: Record<string, unknown>;
    expectedStatus: number;
  }> = [
    {
      name: 'lost-found-log',
      path: '/lost-found',
      schemaName: 'CreateLostFoundRequest',
      schema: CreateLostFoundRequest,
      expectedStatus: 201,
      body: {
        rehearsal: false,
        itemLabel: 'Synthetic controlled test bottle',
        categoryLabel: 'Synthetic fixture',
        foundStationId: stationId,
        foundAt: now,
        holderNote: 'Synthetic test desk; no actual visitor or claimant.',
        photoKey: undefined,
      },
    },
    {
      name: 'lost-found-claim',
      path: '/lost-found/' + itemId + '/claim',
      schemaName: 'ClaimLostFoundRequest',
      schema: ClaimLostFoundRequest,
      expectedStatus: 200,
      body: { note: 'Synthetic controlled hand-back location; no claimant data.' },
    },
  ];
  const invalid: Array<{
      id: string;
      path: string;
      schemaName: string;
      body: Record<string, unknown>;
      expectedStatus: 400;
    }> = [],
    acceptedShapeControls: Array<{
      id: string;
      schemaName: string;
      body: Record<string, unknown>;
    }> = [];
  for (const row of definitions) {
    row.schema.parse(row.body);
    const candidate = (id: string, body: Record<string, unknown>) => {
      if (row.schema.safeParse(body).success)
        acceptedShapeControls.push({ id, schemaName: row.schemaName, body });
      else
        invalid.push({ id, path: row.path, schemaName: row.schemaName, body, expectedStatus: 400 });
    };
    for (const field of Object.keys(row.body)) {
      const missing = { ...row.body };
      delete missing[field];
      candidate(row.name + ':missing:' + field, missing);
      for (const [label, value] of [
        ['null', null],
        ['number', 0],
        ['boolean', false],
        ['array', []],
        ['object', {}],
        ['empty', ''],
        ['invalid-text', 'invalid'],
        ['overlong', 'x'.repeat(2201)],
      ] as const) {
        if (JSON.stringify(value) === JSON.stringify(row.body[field])) continue;
        candidate(row.name + ':' + field + ':' + label, { ...row.body, [field]: value });
      }
    }
    candidate(row.name + ':unknown-key', { ...row.body, unexpected: true });
  }
  const malformedQueries: Array<Record<string, string | string[]>> = [
    { limit: '0' },
    { limit: '-1' },
    { limit: '201' },
    { limit: '1.5' },
    { limit: 'invalid' },
    { limit: '' },
    { cursor: '' },
    { status: 'invalid' },
    { q: 'x'.repeat(121) },
    { unexpected: '1' },
    { limit: ['1', '2'] },
    { cursor: ['one', 'two'] },
  ];
  for (const query of malformedQueries)
    if (ListLostFoundQuery.safeParse(query).success)
      throw new Error('A valid query cannot be classified as malformed');
  return {
    invalid,
    acceptedShapeControls,
    malformedQueries,
    definitions: definitions.map(({ schema, ...row }) => ({
      ...row,
      baselineAccepted: schema.safeParse(row.body).success,
    })),
    positivePhotoOwnershipAcceptance: false,
  };
}
