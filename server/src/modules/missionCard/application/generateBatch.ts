import type { GenerateCardBatchRequest, GenerateCardBatchResponse } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { createCardBatch } from '../data/repo.js';
import { generateBatchRows, toBatchCsv, type BatchRow } from '../domain/cardBatch.js';

/** Collisions with existing codes are rare (32^6 codes); a few rounds always suffice. */
const MAX_ROUNDS = 5;

/**
 * Insert `count` new cards, topping up whatever a collision with an existing
 * code skipped. Only inserted rows are returned, so only they are printed:
 * printing a skipped code would put a second physical card on another
 * visitor's journey (F03-022).
 */
async function insertFreshCards(count: number, batchLabel: string): Promise<BatchRow[]> {
  const inserted: BatchRow[] = [];
  for (let round = 0; round < MAX_ROUNDS && inserted.length < count; round += 1) {
    inserted.push(
      ...(await createCardBatch(generateBatchRows(count - inserted.length, batchLabel))),
    );
  }
  return inserted;
}

/**
 * Generate a print batch (PRODUCT_BRIEF §4.4): a CSV of short code and QR
 * payload, ready for the printer. Work backwards from the print deadline, not
 * the event date — the codes have to be in the card design before it prints.
 */
export async function generateBatch(
  request: GenerateCardBatchRequest,
  audit: AuditContext,
): Promise<GenerateCardBatchResponse> {
  const rows = await insertFreshCards(request.count, request.batchLabel);
  const created = rows.length;

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...audit,
      action: 'card.issue',
      entityType: 'MissionCardBatch',
      entityId: request.batchLabel,
      after: { requested: request.count, created },
    });
  });

  return { batchLabel: request.batchLabel, created, csv: toBatchCsv(rows) };
}
