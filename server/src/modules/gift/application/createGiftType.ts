import { ERROR_CODES, type CreateGiftTypeRequest, type GiftTypeRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { createGiftTypeRow, findGiftTypeByName } from '../data/repo.js';

export async function createGiftType(
  request: CreateGiftTypeRequest,
  audit: AuditContext,
): Promise<GiftTypeRecord> {
  if (await findGiftTypeByName(request.name)) {
    throw new ConflictError(ERROR_CODES.GIFT_TYPE_EXISTS, `${request.name} already exists`);
  }

  const gift = await prisma.$transaction(async (tx) => {
    const row = await createGiftTypeRow(tx, {
      name: request.name,
      initialStock: request.initialStock,
      lowStockThreshold: request.lowStockThreshold,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'giftType.create',
      entityType: 'GiftType',
      entityId: row.id,
      after: { name: row.name, initialStock: row.initialStock },
    });
    return row;
  });

  return toGiftTypeRecord(gift, { redeemed: 0, adjustment: 0 });
}
