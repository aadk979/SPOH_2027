import type { ActiveLostPersonResponse } from '@spoh/shared';
import { findStationById } from '../../station/index.js';
import { toAlertRecord } from '../data/mappers.js';
import { acknowledgedAlertIds, listActiveAlerts } from '../data/repo.js';

/**
 * The client polls this every 10 seconds. Push is best effort; the poll is the
 * contract (BUILD_PLAN §7.3).
 */
export async function getActiveAlerts(viewerId: string): Promise<ActiveLostPersonResponse> {
  const alerts = await listActiveAlerts();
  const acked = await acknowledgedAlertIds(
    viewerId,
    alerts.map((alert) => alert.id),
  );

  const records = await Promise.all(
    alerts.map(async (alert) => {
      const station = alert.lastSeenStationId
        ? await findStationById(alert.lastSeenStationId)
        : null;
      return toAlertRecord(alert, {
        stationName: station?.name ?? null,
        ackedByMe: acked.has(alert.id),
      });
    }),
  );

  return { asOf: new Date().toISOString(), alerts: records };
}
