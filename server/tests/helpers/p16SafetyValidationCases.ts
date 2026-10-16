import { randomUUID } from 'node:crypto';
import {
  CreateIncidentRequest,
  CreateIncidentFollowUpRequest,
  UpdateIncidentStatusRequest,
  RaiseLostPersonRequest,
  ResolveLostPersonRequest,
} from '@spoh/shared';
import type { ZodType } from 'zod';

/** Candidate HTTP bodies; accepted optional omissions are recorded separately from refusals. */
export function safetyValidationCases({
  stationId,
  incidentId,
  lostPersonId,
  now,
}: {
  stationId: string;
  incidentId: string;
  lostPersonId: string;
  now: string;
}) {
  const definitions: Array<{
    name: string;
    path: string;
    schemaName: string;
    schema: ZodType;
    body: Record<string, unknown>;
  }> = [
    {
      name: 'incident-create',
      path: '/incidents',
      schemaName: 'CreateIncidentRequest',
      schema: CreateIncidentRequest,
      body: {
        idempotencyKey: randomUUID(),
        clientRecordedAt: now,
        rehearsal: false,
        type: 'EQUIPMENT',
        severity: 'LOW',
        stationId,
        locationNote: 'Synthetic staging fixture only.',
        description: 'Synthetic controlled validation record: no actual incident or person.',
        occurredAt: now,
      },
    },
    {
      name: 'incident-follow-up',
      path: '/incidents/' + incidentId + '/follow-ups',
      schemaName: 'CreateIncidentFollowUpRequest',
      schema: CreateIncidentFollowUpRequest,
      body: { note: 'Synthetic validation follow-up only.' },
    },
    {
      name: 'incident-status',
      path: '/incidents/' + incidentId + '/status',
      schemaName: 'UpdateIncidentStatusRequest',
      schema: UpdateIncidentStatusRequest,
      body: { status: 'ACKNOWLEDGED', note: 'Synthetic controlled status validation only.' },
    },
    {
      name: 'lost-person-raise',
      path: '/lost-person',
      schemaName: 'RaiseLostPersonRequest',
      schema: RaiseLostPersonRequest,
      body: {
        idempotencyKey: randomUUID(),
        rehearsal: false,
        approxAge: 'Synthetic marker only',
        descriptionText: 'Synthetic controlled test marker; no actual missing person.',
        clothingText: 'Synthetic fixture marker only.',
        lastSeenStationId: stationId,
        lastSeenAt: now,
      },
    },
    {
      name: 'lost-person-resolve',
      path: '/lost-person/' + lostPersonId + '/resolve',
      schemaName: 'ResolveLostPersonRequest',
      schema: ResolveLostPersonRequest,
      body: {
        outcome: 'RESOLVED_FOUND',
        note: 'Synthetic test fixture was never an actual missing person.',
      },
    },
  ];
  const invalid: Array<{
      id: string;
      method: 'POST';
      path: string;
      schemaName: string;
      body: Record<string, unknown>;
      expectedStatus: 400;
      issuePaths: string[];
    }> = [],
    acceptedShapeControls: Array<{
      id: string;
      schemaName: string;
      body: Record<string, unknown>;
    }> = [];
  for (const definition of definitions) {
    definition.schema.parse(definition.body);
    function candidate(id: string, body: Record<string, unknown>) {
      const parsed = definition.schema.safeParse(body);
      if (parsed.success)
        acceptedShapeControls.push({ id, schemaName: definition.schemaName, body });
      else
        invalid.push({
          id,
          method: 'POST',
          path: definition.path,
          schemaName: definition.schemaName,
          body,
          expectedStatus: 400,
          issuePaths: parsed.error.issues.map((issue) => issue.path.map(String).join('.')),
        });
    }
    for (const field of Object.keys(definition.body)) {
      const baseline: Record<string, unknown> = {
          ...definition.body,
          ...('idempotencyKey' in definition.body ? { idempotencyKey: randomUUID() } : {}),
        },
        missing: Record<string, unknown> = { ...baseline };
      delete missing[field];
      candidate(definition.name + ':missing:' + field, missing);
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
        if (JSON.stringify(value) === JSON.stringify(definition.body[field])) continue;
        candidate(definition.name + ':' + field + ':' + label, { ...baseline, [field]: value });
      }
    }
    candidate(definition.name + ':unknown-key', { ...definition.body, unexpected: true });
  }
  return {
    invalid,
    acceptedShapeControls,
    definitions: definitions.map(({ schema, ...row }) => ({
      ...row,
      baselineAccepted: schema.safeParse(row.body).success,
    })),
  };
}
