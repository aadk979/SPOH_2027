import type { GenerateCardBatchRequest, GenerateCardBatchResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { createCardBatch } from '../data/repo.js';
import { generateBatchRows, toBatchCsv, type BatchRow } from '../domain/cardBatch.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** Collisions with existing codes are rare (32^6 codes); a few rounds always suffice. */
const MAX_ROUNDS = 5;

/**
 * Insert `count` new cards, topping up whatever a collision with an existing
 * code skipped. Only inserted rows are returned, so only they are printed:
 * printing a skipped code would put a second physical card on another
 * visitor's journey (F03-022).
 */
async function insertFreshCards(
  tx: PrismaTransactionClient,
  scope: EventScope,
  batch: Pick<GenerateCardBatchRequest, 'count' | 'batchLabel' | 'rehearsal'>,
): Promise<BatchRow[]> {
  const inserted: BatchRow[] = [];
  for (let round = 0; round < MAX_ROUNDS && inserted.length < batch.count; round += 1) {
    const rows = generateBatchRows(batch.count - inserted.length, {
      batchLabel: batch.batchLabel,
      rehearsal: batch.rehearsal,
    });
    inserted.push(...(await createCardBatch(tx, scope, rows)));
  }
  return inserted;
}

/** A print run can be thousands of rows; give its one transaction room. */
const BATCH_TRANSACTION = { timeout: 60_000 };

/**
 * Generate a print batch (PRODUCT_BRIEF §4.4): a CSV of short code and QR
 * payload, ready for the printer. Work backwards from the print deadline, not
 * the event date — the codes have to be in the card design before it prints.
 */
export async function generateBatch(
  request: GenerateCardBatchRequest,
  { scope, audit }: ActorContext,
): Promise<GenerateCardBatchResponse> {
  // The cards and their audit row commit together, and the batch is its own
  // action: it was audited as card.issue, after the insert (F03-018).
  return prisma.$transaction(async (tx) => {
    await lockReserved(tx, scope, request.idempotencyKey);
    const inserted = await insertFreshCards(tx, scope, request);
    await writeAudit(tx, {
      ...audit,
      action: 'card.batch',
      entityType: 'MissionCardBatch',
      entityId: request.batchLabel,
      after: { requested: request.count, created: inserted.length, rehearsal: request.rehearsal },
    });
    const response = {
      batchLabel: request.batchLabel,
      rehearsal: request.rehearsal,
      created: inserted.length,
      csv: toBatchCsv(inserted),
    };
    await settleReserved(tx, scope, {
      key: request.idempotencyKey,
      statusCode: 201,
      body: response,
    });
    return response;
  }, BATCH_TRANSACTION);
}
