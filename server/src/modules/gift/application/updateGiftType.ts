import type { GiftTypeRecord, UpdateGiftTypeRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { requireGiftAuthority } from './giftAuthority.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { findGiftType, totalsForGiftType, updateGiftTypeRow } from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

export async function updateGiftType(
  id: string,
  patch: UpdateGiftTypeRequest,
  actor: ActorContext,
): Promise<GiftTypeRecord> {
  const { scope, audit } = actor;

  const gift = await prisma.$transaction(async (tx) => {
    await requireGiftAuthority(tx, actor, 'Structure.Edit');
    if (patch.idempotencyKey) await lockReserved(tx, scope, patch.idempotencyKey);
    const existing = await findGiftType(scope, id, tx);
    if (!existing) throw new NotFoundError('Gift type');
    if (patch.active === true && !existing.active)
      await requireGiftAuthority(tx, actor, 'Structure.Change');
    const row = await updateGiftTypeRow(tx, scope, {
      id,
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.lowStockThreshold !== undefined
          ? { lowStockThreshold: patch.lowStockThreshold }
          : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    await writeAudit(tx, {
      ...audit,
      action: 'giftType.update',
      entityType: 'GiftType',
      entityId: id,
      before: {
        name: existing.name,
        lowStockThreshold: existing.lowStockThreshold,
        active: existing.active,
      },
      after: { name: row.name, lowStockThreshold: row.lowStockThreshold, active: row.active },
    });
    const record = toGiftTypeRecord(row, await totalsForGiftType(tx, scope, id));
    if (patch.idempotencyKey)
      await settleReserved(tx, scope, {
        key: patch.idempotencyKey,
        statusCode: 200,
        body: { giftType: record },
      });
    return record;
  });

  return gift;
}
