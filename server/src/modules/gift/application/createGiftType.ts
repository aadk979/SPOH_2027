import { ERROR_CODES, type CreateGiftTypeRequest, type GiftTypeRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { requireGiftAuthority } from './giftAuthority.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { createGiftTypeRow, findGiftTypeByName } from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

export async function createGiftType(
  request: CreateGiftTypeRequest,
  actor: ActorContext,
): Promise<GiftTypeRecord> {
  const { scope, audit } = actor;
  if (await findGiftTypeByName(scope, request.name)) {
    throw new ConflictError(ERROR_CODES.GIFT_TYPE_EXISTS, `${request.name} already exists`);
  }

  const gift = await prisma.$transaction(async (tx) => {
    await requireGiftAuthority(tx, actor, 'Structure.Change');
    if (request.idempotencyKey) await lockReserved(tx, scope, request.idempotencyKey);
    const row = await createGiftTypeRow(tx, scope, {
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
    const record = toGiftTypeRecord(row, { redeemed: 0, adjustment: 0 });
    if (request.idempotencyKey)
      await settleReserved(tx, scope, {
        key: request.idempotencyKey,
        statusCode: 201,
        body: { giftType: record },
      });
    return record;
  });

  return gift;
}
