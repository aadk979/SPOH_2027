import type { LostPersonAlertRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { acknowledgeAlert, findAlertById } from '../data/repo.js';
import { getAlert } from './alertRecord.js';

/**
 * Acknowledge. This is what lets the Safety IC see live how much of the floor
 * an alert has actually reached, rather than assuming a broadcast was read.
 */
export async function acknowledge(
  alertId: string,
  { volunteerId, scope, audit }: ActorContext,
): Promise<LostPersonAlertRecord> {
  const alert = await findAlertById(scope, alertId);
  if (!alert) throw new NotFoundError('Lost person alert');

  await prisma.$transaction(async (tx) => {
    // A second tap is a no-op, and writes no second audit row (F03-018).
    if (!(await acknowledgeAlert(tx, scope, { alertId, volunteerId }))) return;
    await writeAudit(tx, {
      ...audit,
      action: 'lostPerson.acknowledge',
      entityType: 'LostPersonAlert',
      entityId: alertId,
      after: { acknowledgedBy: volunteerId },
    });
  });

  return getAlert(scope, alertId, volunteerId);
}
