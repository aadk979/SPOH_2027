import type { LostPersonAlertRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { acknowledgeAlert, findAlertById } from '../data/repo.js';
import { getAlert } from './alertRecord.js';

/**
 * Acknowledge. This is what lets the Safety IC see live how much of the floor
 * an alert has actually reached, rather than assuming a broadcast was read.
 */
export async function acknowledge(
  alertId: string,
  volunteerId: string,
): Promise<LostPersonAlertRecord> {
  const alert = await findAlertById(alertId);
  if (!alert) throw new NotFoundError('Lost person alert');
  await acknowledgeAlert(alertId, volunteerId);
  return getAlert(alertId, volunteerId);
}
