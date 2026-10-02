import {
  importBatchScope,
  resolveImportProvenance,
  type ImportProvenance,
} from './importProvenance.js';
import type { ImportRegistrationsRequest, ImportResponse } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { assertActiveCategoryIds } from '../../../platform/db/categoryCaptureAdmission.js';
import {
  categoryIdsByCode,
  existingRegistrationKeys,
  insertRegistrations,
  stationIdsByCode,
} from '../data/repo.js';
import { planImport, type KeyedRecord } from '../domain/importPlan.js';
import { importKey } from './importKey.js';
import { runImport } from './runImport.js';

type Row = ImportRegistrationsRequest['rows'][number];

/**
 * The records one sheet row expands into. A paper tally of twelve is twelve
 * rows, because a registration is one person and the table has no quantity
 * column — the count in the request is a transcription convenience.
 */
function registrationRecords(
  request: ImportRegistrationsRequest,
  context: {
    batchScope: string;
    provenance: ImportProvenance;
    recorder: { recordedById: string; recordedByMembershipId: string };
    categoryIds: ReadonlyMap<string, string>;
  },
) {
  return (row: Row, { rowNumber, stationId }: { rowNumber: number; stationId: string }) => {
    const recordedAt = new Date(row.recordedAt ?? (row.timeBlockStart as string));
    return Array.from({ length: row.count }, (_, occurrence) => {
      const key = importKey(request.source, context.batchScope, [
        rowNumber,
        row.stationCode,
        row.category,
        recordedAt.toISOString(),
        occurrence,
      ]);
      const record = {
        categoryId: context.categoryIds.get(row.category) as string,
        stationId,
        ...context.recorder,
        // Source-tagged, so no report can mistake this for an app tap.
        source: request.source,
        rehearsal: context.provenance.rehearsal,
        recordedAt,
        idempotencyKey: key,
      };
      return { key, record };
    });
  };
}

/** A category the event lacks is an issue on its row, like an unknown station. */
function unknownCategory(categoryIds: ReadonlyMap<string, string>) {
  return (row: Row) =>
    categoryIds.has(row.category)
      ? null
      : { field: 'category', message: `Unknown category ${row.category}` };
}

/** Paper or sheet registrations, tagged with their source. */
export async function importRegistrations(
  request: ImportRegistrationsRequest,
  actor: ActorContext,
): Promise<ImportResponse> {
  const recorder = { recordedById: actor.volunteerId, recordedByMembershipId: actor.membershipId };
  const categoryIds = await categoryIdsByCode(actor.scope);
  const provenance = await resolveImportProvenance(actor.scope, request);
  const batchScope = importBatchScope(actor.scope, { ...request, ...provenance });
  const expand = registrationRecords(request, { recorder, categoryIds, provenance, batchScope });
  const rowIssue = unknownCategory(categoryIds);

  const stationIds = await stationIdsByCode(actor.scope);
  const candidates = planImport(
    request.rows,
    { stationIds, existingKeys: new Set(), rowIssue },
    expand,
  );
  const existingKeys = await existingRegistrationKeys(actor.scope, candidates.creates.map(keyOf));
  const plan = planImport(request.rows, { stationIds, existingKeys, rowIssue }, expand);

  return runImport(
    {
      source: request.source,
      commit: request.commit,
      rowCount: request.rows.length,
      targetTable: 'Registration',
      fileName: request.fileName ?? null,
      notes: request.notes ?? null,
      plan,
      provenance,
      insert: insertActiveRegistrations,
    },
    actor,
  );
}

function keyOf(keyed: KeyedRecord<unknown>): string {
  return keyed.key;
}

async function insertActiveRegistrations(
  tx: PrismaTransactionClient,
  scope: EventScope,
  rows: Parameters<typeof insertRegistrations>[2],
) {
  await assertActiveCategoryIds(scope, { db: tx, ids: rows.map((row) => row.categoryId) });
  return insertRegistrations(tx, scope, rows);
}
