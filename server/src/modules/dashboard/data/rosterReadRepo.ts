import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
export function dashboardStationCount(scope: EventScope, db: PrismaTransactionClient) {
  return db.station.count({ where: { eventId: scope.eventId } });
}
