import type { GenerateCardBatchRequest, GenerateCardBatchResponse } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { createCardBatch } from '../data/repo.js';
import { generateBatchRows, toBatchCsv } from '../domain/cardBatch.js';

/**
 * Generate a print batch (PRODUCT_BRIEF §4.4): a CSV of short code and QR
 * payload, ready for the printer. Work backwards from the print deadline, not
 * the event date — the codes have to be in the card design before it prints.
 */
export async function generateBatch(
  request: GenerateCardBatchRequest,
  audit: AuditContext,
): Promise<GenerateCardBatchResponse> {
  const rows = generateBatchRows(request.count, request.batchLabel);
  const created = await createCardBatch(rows);

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
