import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { LostPersonAlertRecord, RaiseLostPersonRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { dispatch } from '../../notification/index.js';
import { requireEventStation } from '../../station/index.js';
import { createAlert } from '../data/repo.js';
import { raisedPush } from '../domain/alertRules.js';
import { decorate } from './alertRecord.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

/**
 * Raise an alert and fan it out to every device. The 10-second poll of
 * `/lost-person/active` remains the delivery guarantee; the push reaches the
 * phones in a pocket with the app closed.
 */
export async function raiseAlert(
  request: RaiseLostPersonRequest,
  { volunteerId, scope, audit, clock = systemClock }: ActorContext & { clock?: Clock },
): Promise<LostPersonAlertRecord> {
  const lastSeenStationId = await requireEventStation(scope, request.lastSeenStationId);
  const alert = await prisma.$transaction(async (tx) => {
    await captureProvenance(tx, scope, request);
    const row = await createAlert(tx, scope, {
      approxAge: request.approxAge ?? null,
      descriptionText: request.descriptionText,
      clothingText: request.clothingText ?? null,
      lastSeenStationId,
      lastSeenAt: request.lastSeenAt ? new Date(request.lastSeenAt) : null,
      raisedById: volunteerId,
      raisedAt: clock.now(),
    });
    await writeAudit(tx, {
      ...audit,
      action: 'lostPerson.raise',
      entityType: 'LostPersonAlert',
      entityId: row.id,
      // No description in the audit payload. The alert's own fields are purged
      // on resolution; copying them into an audit row that is never purged
      // would quietly defeat the whole transience guarantee.
      after: { lastSeenStationId: row.lastSeenStationId, rehearsal: row.rehearsal },
    });
    return row;
  });

  void dispatch(scope, raisedPush(alert));
  return decorate(scope, alert, volunteerId);
}
