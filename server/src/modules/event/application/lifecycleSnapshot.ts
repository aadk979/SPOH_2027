import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { registrationStationTypeCount, type LifecycleEvent } from '../data/lifecycleRepo.js';
import type { ObservedLifecycleSnapshot } from '../domain/lifecycle.js';
import { archiveReadiness } from './archiveReadiness.js';
import { readGoLiveReadiness } from './readGoLiveReadiness.js';

function timezoneValid(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Server-owned structure and close-out evidence supply guards; clients cannot submit checks. */
export async function lifecycleSnapshot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { event: LifecycleEvent; now: Date },
): Promise<ObservedLifecycleSnapshot> {
  const { event } = input;
  const readiness = await readGoLiveReadiness(tx, { scope, now: input.now });
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
    goLiveChecks: readiness.checks,
    goLiveReadiness: readiness.items,
    archive: await archiveReadiness(tx, scope, input),
  };
}
