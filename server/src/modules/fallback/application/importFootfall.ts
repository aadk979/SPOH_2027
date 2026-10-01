import {
  importBatchScope,
  resolveImportProvenance,
  type ImportProvenance,
} from './importProvenance.js';
import type { ImportFootfallRequest, ImportResponse } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { existingFootfallKeys, insertFootfall, stationIdsByCode } from '../data/repo.js';
import { planImport } from '../domain/importPlan.js';
import { importKey } from './importKey.js';
import { runImport } from './runImport.js';

/** A sheet row as footfall records, keyed for idempotency. */
function blockTotals(
  request: ImportFootfallRequest,
  actor: ActorContext,
  provenance: ImportProvenance,
) {
  const recorder = { recordedById: actor.volunteerId, recordedByMembershipId: actor.membershipId };
  return (
    row: ImportFootfallRequest['rows'][number],
    { rowNumber, stationId }: { rowNumber: number; stationId: string },
  ) => {
    const timeBlockStart = new Date(row.timeBlockStart);
    const key = importKey(
      request.source,
      importBatchScope(actor.scope, { ...request, ...provenance }),
      [rowNumber, row.stationCode, timeBlockStart.toISOString()],
    );
    return [
      {
        key,
        record: {
          stationId,
          ...recorder,
          // A block total is one row with a quantity. Splitting it into
          // individual ticks would invent a precision the tally never had.
          quantity: row.quantity,
          source: request.source,
          rehearsal: provenance.rehearsal,
          recordedAt: timeBlockStart,
          timeBlockStart,
          idempotencyKey: key,
        },
      },
    ];
  };
}

/** Paper or sheet footfall: one row per block total, tagged with its source. */
export async function importFootfall(
  request: ImportFootfallRequest,
  actor: ActorContext,
): Promise<ImportResponse> {
  const provenance = await resolveImportProvenance(actor.scope, request);
  const expand = blockTotals(request, actor, provenance);
  const stationIds = await stationIdsByCode(actor.scope);
  const candidates = planImport(request.rows, { stationIds, existingKeys: new Set() }, expand);
  const existingKeys = await existingFootfallKeys(
    actor.scope,
    candidates.creates.map((keyed) => keyed.key),
  );
  const plan = planImport(request.rows, { stationIds, existingKeys }, expand);

  return runImport(
    {
      source: request.source,
      commit: request.commit,
      rowCount: request.rows.length,
      targetTable: 'FootfallTick',
      fileName: request.fileName ?? null,
      notes: request.notes ?? null,
      plan,
      provenance,
      insert: insertFootfall,
    },
    actor,
  );
}
