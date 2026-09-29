import type { GiftTypeRecord, UpdateGiftTypeRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { findGiftType, totalsForGiftType, updateGiftTypeRow } from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

export async function updateGiftType(
  id: string,
  patch: UpdateGiftTypeRequest,
  { scope, audit }: ActorContext,
): Promise<GiftTypeRecord> {
  const existing = await findGiftType(scope, id);
  if (!existing) throw new NotFoundError('Gift type');

  const gift = await prisma.$transaction(async (tx) => {
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
      after: { ...patch },
    });
    return row;
  });

  return toGiftTypeRecord(gift, await totalsForGiftType(prisma, scope, id));
}
