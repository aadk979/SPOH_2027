import type { ImportRegistrationsRequest, ImportResponse } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { existingRegistrationKeys, insertRegistrations, stationIdsByCode } from '../data/repo.js';
import { planImport, type KeyedRecord } from '../domain/importPlan.js';
import { importKey } from './importKey.js';
import { runImport } from './runImport.js';

/** Paper or sheet registrations, tagged with their source. */
export async function importRegistrations(
  request: ImportRegistrationsRequest,
  actor: ActorContext,
): Promise<ImportResponse> {
  const recorder = { recordedById: actor.volunteerId, recordedByMembershipId: actor.membershipId };
  const expand = (
    row: ImportRegistrationsRequest['rows'][number],
    { rowNumber, stationId }: { rowNumber: number; stationId: string },
  ) => {
    const recordedAt = new Date(row.recordedAt ?? (row.timeBlockStart as string));
    // A paper tally of twelve is twelve rows, because a registration is one
    // person and the table has no quantity column — the count in the request
    // is a transcription convenience, not a data shape.
    return Array.from({ length: row.count }, (_, occurrence) => {
      const key = importKey(request.source, request.fileName ?? 'manual', [
        rowNumber,
        row.stationCode,
        row.category,
        recordedAt.toISOString(),
        occurrence,
      ]);
      return {
        key,
        record: {
          category: row.category,
          stationId,
          ...recorder,
          // Source-tagged, so no report can mistake this for an app tap.
          source: request.source,
          recordedAt,
          idempotencyKey: key,
        },
      };
    });
  };

  const stationIds = await stationIdsByCode(actor.scope);
  const candidates = planImport(request.rows, { stationIds, existingKeys: new Set() }, expand);
  const existingKeys = await existingRegistrationKeys(actor.scope, candidates.creates.map(keyOf));
  const plan = planImport(request.rows, { stationIds, existingKeys }, expand);

  return runImport(
    {
      source: request.source,
      commit: request.commit,
      rowCount: request.rows.length,
      targetTable: 'Registration',
      fileName: request.fileName ?? null,
      notes: request.notes ?? null,
      plan,
      insert: insertRegistrations,
    },
    actor,
  );
}

function keyOf(keyed: KeyedRecord<unknown>): string {
  return keyed.key;
}
