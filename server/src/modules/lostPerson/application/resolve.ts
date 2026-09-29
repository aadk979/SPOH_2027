import type { LostPersonAlertRecord, ResolveLostPersonRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { minutesBetween } from '../../../platform/time/index.js';
import { dispatch } from '../../notification/index.js';
import { findAlertById, resolveAlert } from '../data/repo.js';
import { assertAlertActive, resolvedPush } from '../domain/alertRules.js';
import { getAlert } from './alertRecord.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** Resolving clears the alert on every device, and tells the floor to stand down. */
export async function resolve(
  alertId: string,
  request: ResolveLostPersonRequest,
  { scope, audit }: ActorContext,
): Promise<LostPersonAlertRecord> {
  const existing = await findAlertById(alertId);
  if (!existing) throw new NotFoundError('Lost person alert');
  assertAlertActive(existing);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await resolveAlert(tx, { id: alertId, outcome: request.outcome, at: now });
    await writeAudit(tx, {
      ...audit,
      action: 'lostPerson.resolve',
      entityType: 'LostPersonAlert',
      entityId: alertId,
      before: { status: existing.status },
      after: { status: request.outcome, resolutionMinutes: minutesBetween(existing.raisedAt, now) },
    });
  });

  const record = await getAlert(scope, alertId, audit.actorId ?? '');
  void dispatch(resolvedPush(alertId));
  return record;
}
