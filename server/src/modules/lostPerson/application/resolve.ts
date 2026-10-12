import type { LostPersonAlertRecord, ResolveLostPersonRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { minutesBetween, systemClock, type Clock } from '../../../platform/time/index.js';
import { activeNoticeAudience, queueNotices } from '../../notification/index.js';
import { findAlertForUpdate, resolveAlert } from '../data/repo.js';
import { assertAlertActive } from '../domain/alertRules.js';
import { getAlert } from './alertRecord.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** Resolving clears the alert on every device, and tells the floor to stand down. */
export async function resolve(
  alertId: string,
  request: ResolveLostPersonRequest,
  { scope, audit, clock = systemClock }: ActorContext & { clock?: Clock },
): Promise<LostPersonAlertRecord> {
  await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, scope);
    const alert = await findAlertForUpdate(tx, scope, alertId);
    if (!alert) throw new NotFoundError('Lost person alert');
    assertAlertActive(alert);
    const now = clock.now();
    await resolveAlert(tx, scope, { id: alertId, outcome: request.outcome, at: now });
    await writeAudit(tx, {
      ...audit,
      action: 'lostPerson.resolve',
      entityType: 'LostPersonAlert',
      entityId: alertId,
      before: { status: alert.status, rehearsal: alert.rehearsal },
      after: {
        status: request.outcome,
        resolutionMinutes: minutesBetween(alert.raisedAt, now),
        rehearsal: alert.rehearsal,
      },
    });
    await queueNotices(tx, scope, { kind: 'LOST_PERSON_RESOLVED', priority: 'URGENT',
      source: { kind: 'LOST_PERSON', id: alert.id }, transitionKey: `lostPerson:${alert.id}:resolved`,
      context: { type: 'lost-person' }, recipientPersonIds: await activeNoticeAudience(scope, { tx }),
      createdAt: now });
  });

  const record = await getAlert(scope, alertId, audit.actorId ?? '');
  return record;
}
