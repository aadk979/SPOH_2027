import type { StationDashboardResponse } from '@spoh/shared';
import { toShiftRef } from '../../../platform/db/shiftRef.js';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import { prepareThresholds } from '../../../platform/settings/thresholds.js';
import { minutesBetween } from '../../../platform/time/index.js';
import { footfallByDevice, registrationsByDevice, stampsAtStation, stationRegistrationsByCategory,
  stationRoster, type Window } from '../data/repo.js';
import { flaggedRedemptions } from '../data/flaggedRedemptions.js';
import { stationSourceTotals } from '../data/sourceTotals.js';
import { deviceRate } from '../domain/signals.js';
type Totals = Awaited<ReturnType<typeof stationSourceTotals>>;
type PanelInput = { stationId: string; window: Window; privateRoster: boolean; totals: Totals };
async function registrationsPanel(scope: ReportingScope, input: PanelInput): Promise<StationDashboardResponse['registrations']> {
  const implausibleRate = (await prepareThresholds(scope)).implausibleTapsPerMinute(input.stationId);
  const devices = await (input.privateRoster ? registrationsByDevice(scope, input.stationId, input.window) : []);
  const byCategory = await (stationRegistrationsByCategory(scope, input.stationId, input.window));
  return { unit: 'registrations', todayTotal: input.totals.registrations.reduce((sum, row) => sum + row.value, 0),
    sourceBreakdown: input.totals.registrations, byCategory,
    byDevice: devices.map((device) => ({ volunteerId: device.volunteerId, volunteerName: device.volunteerName, value: device.value,
      ...deviceRate(device.value, minutesBetween(device.firstAt, device.lastAt), implausibleRate) })) };
}
async function footfallPanel(scope: ReportingScope, input: PanelInput): Promise<StationDashboardResponse['footfall']> {
  const devices = input.privateRoster ? await footfallByDevice(scope, input.stationId, input.window) : [];
  return { unit: 'roomEntries', todayTotal: input.totals.footfall.reduce((sum, row) => sum + row.value, 0),
    sourceBreakdown: input.totals.footfall, lastActivityAt: input.totals.lastFootfallAt?.toISOString() ?? null,
    contributors: devices.map((device) => ({ volunteerId: device.volunteerId, volunteerName: device.volunteerName,
      value: device.value, lastActivityAt: device.lastAt.toISOString() })) };
}
async function rosterPanel(scope: ReportingScope, input: { stationId: string; today: Date }): Promise<StationDashboardResponse['roster']> {
  const roster = await stationRoster(scope, input.stationId, input.today);
  return roster.map((assignment) => ({ assignmentId: assignment.id, shift: toShiftRef(assignment.shift),
    volunteerId: assignment.volunteerId, volunteerName: assignment.volunteer.displayName, roleLabel: assignment.roleLabel,
    checkedInAt: assignment.checkedInAt?.toISOString() ?? null, checkedOutAt: assignment.checkedOutAt?.toISOString() ?? null }));
}
export async function stationPanels(scope: ReportingScope, input: Omit<PanelInput, 'totals'> & { today: Date }) {
  const totals = await stationSourceTotals(scope, input.stationId, input.window);
  const panelInput = { ...input, totals };
  const registrations = await (registrationsPanel(scope, panelInput));
  const footfall = await (footfallPanel(scope, panelInput));
  const stamps = await (stampsAtStation(scope, input.stationId, input.window));
  const roster = await (input.privateRoster ? rosterPanel(scope, input) : []);
  const flagged = await (input.privateRoster ? flaggedRedemptions(scope, { ...input.window, stationId: input.stationId }) : []);
  return { registrations, footfall, stamps, roster, flaggedRedemptions: flagged };
}
