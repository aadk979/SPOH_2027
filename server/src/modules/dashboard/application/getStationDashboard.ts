import type { StationDashboardResponse } from '@spoh/shared';
import { systemClock } from '../../../platform/time/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { eventToday, eventTodayStart } from '../../../platform/event/today.js';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { findStationById } from '../../station/index.js';
import { dashboardObservation } from './observation.js';
import { stationRosterAccess } from './rosterAccess.js';
import { stationPanels } from './stationPanels.js';

type StationOptions = Date | { now?: Date; reader?: ReadContext };
function stationOptions(options: StationOptions) {
  return options instanceof Date ? { now: options } : { now: options.now ?? systemClock.now(),
    ...(options.reader ? { reader: options.reader } : {}) };
}

/** Count authority does not grant the private roster or device facets. */
export async function getStationDashboard(scope: ReportingScope, stationId: string,
  options: StationOptions = systemClock.now()): Promise<StationDashboardResponse> {
  const input = stationOptions(options);
  const station = await findStationById(scope, stationId);
  if (!station) throw new NotFoundError('Station');
  const since = await eventTodayStart(scope, input.now);
  const today = await eventToday(scope, input.now);
  const privateRoster = await stationRosterAccess(scope, { stationId, ...input });
  const panels = await stationPanels(scope, { stationId, window: { since, until: input.now }, today, privateRoster });
  return { rehearsalIncluded: scope.includeRehearsal ?? false, asOf: input.now.toISOString(),
    observation: dashboardObservation(scope, { today, since, now: input.now }), stationId: station.id, stationName: station.name,
    rosterAvailability: privateRoster ? 'available' : 'denied', deviceAvailability: privateRoster ? 'available' : 'denied', ...panels };
}
