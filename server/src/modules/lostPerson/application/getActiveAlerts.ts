import type { ActiveLostPersonResponse } from '@spoh/shared';
import { findStationNames } from '../../station/index.js';
import { toAlertRecord } from '../data/mappers.js';
import { acknowledgedAlertIds, listActiveAlerts } from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * The client polls this every 10 seconds. Push is best effort; the poll is the
 * contract (BUILD_PLAN §7.3).
 */
export async function getActiveAlerts(
  scope: EventScope,
  viewerId: string,
): Promise<ActiveLostPersonResponse> {
  const alerts = await listActiveAlerts(scope);
  const acked = await acknowledgedAlertIds(scope, {
    volunteerId: viewerId,
    alertIds: alerts.map((alert) => alert.id),
  });

  // Every device polls this; one station query for all the alerts, not one each (F03-029).
  const stationNames = await findStationNames(
    scope,
    alerts.flatMap((alert) => (alert.lastSeenStationId ? [alert.lastSeenStationId] : [])),
  );
  const records = alerts.map((alert) =>
    toAlertRecord(alert, {
      stationName: alert.lastSeenStationId
        ? (stationNames.get(alert.lastSeenStationId) ?? null)
        : null,
      ackedByMe: acked.has(alert.id),
    }),
  );

  return { asOf: new Date().toISOString(), alerts: records };
}
