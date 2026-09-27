import type { LostPersonAlertRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findStationById } from '../../station/index.js';
import { toAlertRecord } from '../data/mappers.js';
import { acknowledgedAlertIds, findAlertById, type AlertWithContext } from '../data/repo.js';

/** An alert as one viewer sees it: the station's name, and whether they acknowledged it. */
export async function decorate(
  alert: AlertWithContext,
  viewerId: string,
): Promise<LostPersonAlertRecord> {
  const station = alert.lastSeenStationId ? await findStationById(alert.lastSeenStationId) : null;
  const acked = await acknowledgedAlertIds(viewerId, [alert.id]);
  return toAlertRecord(alert, {
    stationName: station?.name ?? null,
    ackedByMe: acked.has(alert.id),
  });
}

/** One alert as the viewer sees it now: after a purge, without its description. */
export async function getAlert(alertId: string, viewerId: string): Promise<LostPersonAlertRecord> {
  const alert = await findAlertById(alertId);
  if (!alert) throw new NotFoundError('Lost person alert');
  return decorate(alert, viewerId);
}
