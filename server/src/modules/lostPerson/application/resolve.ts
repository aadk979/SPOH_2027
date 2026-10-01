import type { LostPersonAlertRecord, ResolveLostPersonRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { minutesBetween, systemClock, type Clock } from '../../../platform/time/index.js';
import { dispatch } from '../../notification/index.js';
import { findAlertForUpdate, resolveAlert } from '../data/repo.js';
import { assertAlertActive, resolvedPush } from '../domain/alertRules.js';
import { getAlert } from './alertRecord.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** Resolving clears the alert on every device, and tells the floor to stand down. */
export async function resolve(
  alertId: string,
  request: ResolveLostPersonRequest,
  { scope, audit, clock = systemClock }: ActorContext & { clock?: Clock },
): Promise<LostPersonAlertRecord> {
  const existing = await prisma.$transaction(async (tx) => {
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
    return alert;
  });

  const record = await getAlert(scope, alertId, audit.actorId ?? '');
  void dispatch(scope, resolvedPush(existing));
  return record;
}
