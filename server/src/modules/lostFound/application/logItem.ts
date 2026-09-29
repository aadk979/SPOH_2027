import type { CreateLostFoundRequest, LostFoundRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { createItem } from '../data/repo.js';
import { toRecordWithStation } from './itemRecord.js';

/** Log a found item: what it is, where it was found, where it is kept. */
export async function logItem(
  request: CreateLostFoundRequest,
  { volunteerId, scope, audit }: ActorContext,
): Promise<LostFoundRecord> {
  const item = await prisma.$transaction(async (tx) => {
    const row = await createItem(tx, scope, {
      itemLabel: request.itemLabel,
      categoryLabel: request.categoryLabel ?? null,
      foundStationId: request.foundStationId ?? null,
      foundAt: request.foundAt ? new Date(request.foundAt) : new Date(),
      holderNote: request.holderNote ?? null,
      photoKey: request.photoKey ?? null,
      loggedById: volunteerId,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'lostFound.create',
      entityType: 'LostFoundItem',
      entityId: row.id,
      after: { itemLabel: row.itemLabel, foundStationId: row.foundStationId },
    });
    return row;
  });

  return toRecordWithStation(scope, item);
}
