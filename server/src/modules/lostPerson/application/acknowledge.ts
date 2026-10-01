import type { LostPersonAlertRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { acknowledgeAlert, findAlertForUpdate } from '../data/repo.js';
import { getAlert } from './alertRecord.js';

/**
 * Acknowledge. This is what lets the Safety IC see live how much of the floor
 * an alert has actually reached, rather than assuming a broadcast was read.
 */
export async function acknowledge(
  alertId: string,
  { volunteerId, scope, audit }: ActorContext,
): Promise<LostPersonAlertRecord> {
  await prisma.$transaction(async (tx) => {
    const alert = await findAlertForUpdate(tx, scope, alertId);
    if (!alert) throw new NotFoundError('Lost person alert');
    // A second tap is a no-op, and writes no second audit row (F03-018).
    if (!(await acknowledgeAlert(tx, scope, { alertId, volunteerId, rehearsal: alert.rehearsal })))
      return;
    await writeAudit(tx, {
      ...audit,
      action: 'lostPerson.acknowledge',
      entityType: 'LostPersonAlert',
      entityId: alertId,
      after: { acknowledgedBy: volunteerId, rehearsal: alert.rehearsal },
    });
  });

  return getAlert(scope, alertId, volunteerId);
}
