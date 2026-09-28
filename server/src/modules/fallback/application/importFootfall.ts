import type { ImportFootfallRequest, ImportResponse } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { existingFootfallKeys, insertFootfall, stationIdsByCode } from '../data/repo.js';
import { planImport } from '../domain/importPlan.js';
import { importKey } from './importKey.js';
import { runImport } from './runImport.js';

/** Paper or sheet footfall: one row per block total, tagged with its source. */
export async function importFootfall(
  request: ImportFootfallRequest,
  actor: ActorContext,
): Promise<ImportResponse> {
  const expand = (
    row: ImportFootfallRequest['rows'][number],
    { rowNumber, stationId }: { rowNumber: number; stationId: string },
  ) => {
    const timeBlockStart = new Date(row.timeBlockStart);
    const key = importKey(request.source, request.fileName ?? 'manual', [
      rowNumber,
      row.stationCode,
      timeBlockStart.toISOString(),
    ]);
    return [
      {
        key,
        record: {
          stationId,
          recordedById: actor.volunteerId,
          // A block total is one row with a quantity. Splitting it into
          // individual ticks would invent a precision the tally never had.
          quantity: row.quantity,
          source: request.source,
          recordedAt: timeBlockStart,
          timeBlockStart,
          idempotencyKey: key,
        },
      },
    ];
  };

  const stationIds = await stationIdsByCode();
  const candidates = planImport(request.rows, { stationIds, existingKeys: new Set() }, expand);
  const existingKeys = await existingFootfallKeys(candidates.creates.map((keyed) => keyed.key));
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
      insert: insertFootfall,
    },
    actor,
  );
}
