import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { CreateLostFoundRequest, LostFoundRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { requireEventStation } from '../../station/index.js';
import { createItem } from '../data/repo.js';
import { toRecordWithStation } from './itemRecord.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

/** Log a found item: what it is, where it was found, where it is kept. */
export async function logItem(
  request: CreateLostFoundRequest,
  { volunteerId, scope, audit, clock = systemClock }: ActorContext & { clock?: Clock },
): Promise<LostFoundRecord> {
  const foundStationId = await requireEventStation(scope, request.foundStationId);
  const item = await prisma.$transaction(async (tx) => {
    await captureProvenance(tx, scope, request);
    const row = await createItem(tx, scope, {
      itemLabel: request.itemLabel,
      categoryLabel: request.categoryLabel ?? null,
      foundStationId,
      foundAt: request.foundAt ? new Date(request.foundAt) : clock.now(),
      holderNote: request.holderNote ?? null,
      photoKey: request.photoKey ?? null,
      loggedById: volunteerId,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'lostFound.create',
      entityType: 'LostFoundItem',
      entityId: row.id,
      after: {
        itemLabel: row.itemLabel,
        foundStationId: row.foundStationId,
        rehearsal: row.rehearsal,
      },
    });
    return row;
  });

  return toRecordWithStation(scope, item);
}
