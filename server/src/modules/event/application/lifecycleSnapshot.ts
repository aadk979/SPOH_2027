import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { registrationStationTypeCount, type LifecycleEvent } from '../data/lifecycleRepo.js';
import type { LifecycleSnapshot } from '../domain/lifecycle.js';

function timezoneValid(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Only server-owned structure supplies the preparation guard; clients cannot submit checks. */
export async function lifecycleSnapshot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  event: LifecycleEvent,
): Promise<LifecycleSnapshot> {
  return {
    from: event.status,
    hasBeenLive: event.hasBeenLive,
    closedAt: event.closedAt,
    structure: {
      timezoneValid: timezoneValid(event.timezone),
      eventDays: event._count.days,
      shiftTemplates: event._count.shiftTemplates,
      stationTypes: event._count.stationTypes,
      categories: event._count.captureCategories,
      registrationStationTypes: await registrationStationTypeCount(tx, scope),
    },
    goLiveChecks: [],
    archive: {
      lostPersonPurgeComplete: false,
      finalReportExists: false,
      captureGracePeriodComplete: false,
    },
  };
}
