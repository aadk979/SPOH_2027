import { ActiveLostPersonResponse, ArchiveExportRecord, AttendanceStatus, CardFunnelResponse,
  DataHealthResponse, FootfallLiveResponse, FootfallSummaryResponse, FullReport, GiftSummaryResponse,
  GiftTypeRecord, IncidentRecord, LiveDashboardResponse, LostFoundRecord, RegistrationSummaryResponse,
  ReportSnapshotsResponse, StaffingGapsResponse, StationDashboardResponse, zonedDate, zonedDayWindow } from '@spoh/shared';
import { STAFFING_SHIFT } from '../helpers/staffing';
import { EXISTING_GIFT } from '../e2e/stockPrintUiFixture';
import type { CampaignContext, CampaignResponse } from './campaignTypes';

const name = 'Sample Person';
const room = 'Room';
const snapshotId = 'campaign-final-report';
const incidentDescription = 'Queue barrier moved to keep the exit clear.';

function operationalData(input: CampaignContext) {
  const date = zonedDate(new Date(input.now), 'Asia/Singapore');
  const from = zonedDayWindow(date, 'Asia/Singapore', 0).start.toISOString();
  const observation = { date, from, asOf: input.now, includeRehearsal: false };
  const gift = GiftTypeRecord.parse({ ...EXISTING_GIFT, rehearsal: false });
  const flagged = [{ redemptionId: 'campaign-redemption', giftTypeName: gift.name, stationId: 'station',
    stationName: room, recordedByName: name, flag: 'SECOND_GIFT', recordedAt: input.now }];
  const stations = [{ stationId: 'station', stationName: room, todayTotal: 12, lastActivityAt: input.now,
    minutesSinceLastActivity: 0, activeCounterCount: 2, silent: false },
  { stationId: 'station-quiet', stationName: 'Gallery', todayTotal: 0, lastActivityAt: null,
    minutesSinceLastActivity: null, activeCounterCount: 0, silent: true }];
  const stages = [{ key: 'issued', metric: 'issued', label: 'Issued', value: 10, rateOfIssued: 1 },
    { key: 'station:station', metric: 'station', stationId: 'station', label: room, value: 9, rateOfIssued: 0.9 },
    { key: 'completed', metric: 'completed', label: 'Completed', value: 8, rateOfIssued: 0.8 },
    { key: 'redeemed', metric: 'redeemed', label: 'Redeemed', value: 8, rateOfIssued: 0.8 }];
  const staffing = StaffingGapsResponse.parse({ asOf: input.now, activeShifts: [STAFFING_SHIFT],
    gaps: [{ stationId: 'station', stationName: room, shift: STAFFING_SHIFT, assigned: 2, checkedIn: 1, missing: 1, severity: 'PARTIAL' }] });
  const health = DataHealthResponse.parse({ observation, rehearsalIncluded: false, asOf: input.now, rosterAvailability: 'available',
    silentStations: [{ stationId: 'station-quiet', stationName: 'Gallery', lastActivityAt: null, minutesSinceLastActivity: null }],
    staleDevices: [{ volunteerId: input.personId, volunteerName: name, stationName: room, lastCaptureAt: null,
      minutesSinceLastCapture: null, assignmentId: 'assignment', stationId: 'station', shiftId: 'shift', eventDayId: 'day' }],
    fallbackWindowOpen: true, withinEventHours: true, flaggedRedemptions: flagged });
  return { date, from, observation, gift, flagged, stations, stages, staffing, health };
}

type OperationalData = ReturnType<typeof operationalData>;
function dashboardResponses(input: CampaignContext, data: OperationalData): CampaignResponse[] {
  const live = LiveDashboardResponse.parse({ observation: data.observation, rehearsalIncluded: false, asOf: input.now,
    eventDayLabel: 'Day one', withinEventHours: true, headline: null,
    registrations: { unit: 'registrations', todayTotal: 20, lastHour: 8, byCategory: [{ key: 'GUEST', label: 'Guests', value: 20 }] },
    footfall: { unit: 'roomEntries', todayTotal: 12, stations: data.stations },
    cards: { unit: 'cards', issued: 10, completed: 8, redeemed: 8, stages: data.stages }, gifts: [data.gift],
    safety: { openIncidents: 1, criticalIncidents: 0, activeLostPersonAlerts: 0 },
    staffing: { rosterAvailability: 'available', onShift: 2, checkedIn: 1, gaps: data.staffing.gaps,
      longShifts: [{ volunteerId: input.personId, volunteerName: name, stationName: room,
        checkedInAt: new Date(new Date(input.now).getTime() - 200 * 60_000).toISOString(), minutesOnStation: 200,
        assignmentId: 'assignment', stationId: 'station', shiftId: 'shift', eventDayId: 'day' }] }, dataHealth: data.health });
  const station = StationDashboardResponse.parse({ observation: data.observation, rehearsalIncluded: false,
    asOf: input.now, stationId: 'station', stationName: room, rosterAvailability: 'available', deviceAvailability: 'available',
    registrations: { unit: 'registrations', todayTotal: 20, byCategory: [{ key: 'GUEST', label: 'Guests', value: 20 }],
      sourceBreakdown: [{ source: 'APP', value: 15 }, { source: 'PAPER', value: 5 }],
      byDevice: [{ volunteerId: input.personId, volunteerName: name, value: 15, perMinute: 0.5, rateAnomaly: false }] },
    footfall: { unit: 'roomEntries', todayTotal: 12, lastActivityAt: input.now,
      sourceBreakdown: [{ source: 'APP', value: 10 }, { source: 'FALLBACK_SHEET', value: 2 }],
      contributors: [{ volunteerId: input.personId, volunteerName: name, value: 10, lastActivityAt: input.now }] },
    stamps: 9, flaggedRedemptions: data.flagged, roster: [{ assignmentId: 'assignment', shift: STAFFING_SHIFT,
      volunteerId: input.personId, volunteerName: name, roleLabel: 'Counter', checkedInAt: data.from, checkedOutAt: null }] });
  return [{ path: '/dashboard/live', body: live }, { path: '/dashboard/station/station', body: station },
    { path: '/dashboard/data-health', body: data.health }, { path: '/roster/gaps', body: data.staffing }];
}

function countResponses(input: CampaignContext, data: OperationalData): CampaignResponse[] {
  return [
    { path: '/footfall/summary', body: FootfallSummaryResponse.parse({ rehearsalIncluded: false, unit: 'roomEntries', bucket: '30m',
      total: 12, stations: [{ stationId: 'station', stationName: room, total: 12, buckets: [{ bucketStart: data.from, value: 12 }] }], containsFallbackData: true }) },
    { path: '/footfall/live', body: FootfallLiveResponse.parse({ observation: data.observation, rehearsalIncluded: false,
      unit: 'roomEntries', asOf: input.now, stations: data.stations }) },
    { path: '/cards/funnel', body: CardFunnelResponse.parse({ observation: { from: data.from, asOf: input.now, includeRehearsal: false },
      rehearsalIncluded: false, unit: 'cards', issued: 10, completed: 8, redeemed: 8, voided: 1, stages: data.stages, containsFallbackData: true }) },
    { path: '/gifts/summary', body: GiftSummaryResponse.parse({ rehearsal: false, asOf: input.now, unit: 'redemptions', total: data.gift.redeemed,
      byGiftType: [{ giftTypeId: data.gift.id, giftTypeName: data.gift.name, redeemed: data.gift.redeemed, remaining: data.gift.remaining }], containsFallbackData: true }) },
    { path: '/registrations/summary', query: { groupBy: 'category', stationId: 'station' },
      body: RegistrationSummaryResponse.parse({ rehearsalIncluded: false, unit: 'registrations', groupBy: 'category', total: 20,
        buckets: [{ key: 'GUEST', label: 'Guests', value: 20 }], containsFallbackData: true }) },
  ];
}

function safetyResponses(input: CampaignContext): CampaignResponse[] {
  const incident = IncidentRecord.parse({ id: 'campaign-incident', rehearsal: false, type: 'SAFETY_CONCERN', severity: 'MEDIUM',
    status: 'OPEN', stationId: 'station', stationName: room, locationNote: 'Main exit', description: incidentDescription,
    reportedById: input.personId, reportedByName: name, occurredAt: input.now, reportedAt: input.now,
    followUps: [{ id: 'campaign-follow-up', rehearsal: false, note: 'The safety lead has checked the route.',
      authorId: input.personId, authorName: name, createdAt: input.now }] });
  const held = LostFoundRecord.parse({ id: 'campaign-held-item', rehearsal: false, itemLabel: 'Blue water bottle', categoryLabel: 'Bottle',
    foundStationId: 'station', foundStationName: room, foundAt: input.now, holderNote: 'At the welcome desk', photoKey: null,
    status: 'HELD', loggedById: input.personId, loggedByName: name, claimedAt: null, createdAt: input.now });
  const claimed = LostFoundRecord.parse({ ...held, id: 'campaign-claimed-item', itemLabel: 'Black umbrella', status: 'CLAIMED', claimedAt: input.now });
  const active = ActiveLostPersonResponse.parse({ asOf: input.now, alerts: input.routePath === '/safety/lost-person/new' ? [{
    id: 'campaign-lost-person', rehearsal: false, status: 'ACTIVE', approxAge: 'Adult', descriptionText: 'Synthetic search exercise description',
    clothingText: 'Blue top', lastSeenStationId: 'station', lastSeenStationName: room, lastSeenAt: input.now,
    raisedById: input.personId, raisedByName: name, raisedByPhone: null, raisedAt: input.now, resolvedAt: null, ackCount: 4, ackedByMe: false,
  }] : [] });
  return [{ path: '/incidents', query: { limit: '50' }, body: { data: [incident], meta: { count: 1, nextCursor: null } } },
    { path: '/incidents', body: { data: [incident], meta: { count: 1, nextCursor: null } } },
    { path: '/lost-found', query: { status: 'HELD' }, body: { data: [held] } },
    { path: '/lost-found', body: { data: [held, claimed] } }, { path: '/lost-person/active', body: active },
    { path: '/attendance', body: AttendanceStatus.parse({ eventDay: { id: 'day', label: 'Day one' }, configured: true,
      isRoot: true, isExco: true, onCampusNetwork: true, networkConfigured: true,
      attendance: { id: 'campaign-attendance', presentAt: input.now, method: 'ROOT', verifiedByName: null },
      canIssue: true, serverTime: input.now }) }];
}

function frozenReport(input: CampaignContext, data: OperationalData) {
  const fallback = { id: 'campaign-fallback', rehearsal: false, tier: 3,
    startedAt: '2027-01-08T01:15:00.000Z', endedAt: '2027-01-08T01:45:00.000Z', durationMinutes: 30,
    stationId: 'station', stationName: room, declaredById: input.personId, declaredByName: name,
    reason: 'Network outage reconciled against the fallback sheet.', open: false };
  return FullReport.parse({ snapshot: { id: snapshotId, kind: 'FINAL', lifecycleVersion: 4, createdAt: input.now, supersededAt: null },
    rehearsalIncluded: false, generatedAt: input.now, range: { from: data.from, to: input.now }, timezone: 'Asia/Singapore',
    event: { name: 'Synthetic Campaign Event', slug: 'mock-event', status: 'CLOSED', branding: null },
    countingNote: 'Registrations count people, room entries count visits, and cards count journeys. These measures stay separate.', headline: null,
    registrations: { unit: 'registrations', total: 20, byCategory: [{ key: 'GUEST', label: 'Guests', value: 20 }],
      byDay: [{ date: data.date, value: 20 }], byHour: [{ hour: input.now, localHour: `${data.date} 10:00`, value: 20 }], voided: 1 },
    footfall: { unit: 'roomEntries', total: 12, byStation: [{ stationId: 'station', stationName: room, total: 12,
      peakBlockStart: data.from, peakBlockValue: 12 }], curve: [{ bucketStart: data.from, stationId: 'station', value: 12 }],
      bySource: [{ source: 'APP', value: 10 }, { source: 'FALLBACK_SHEET', value: 2 }] },
    cards: { unit: 'cards', issued: 10, completed: 8, voided: 1, completionRate: 0.8,
      issuedByDay: [{ date: data.date, value: 10 }], completedByDay: [{ date: data.date, value: 8 }],
      byStation: [{ stationId: 'station', stationName: room, cards: 9 }] },
    gifts: { unit: 'redemptions', total: data.gift.redeemed, byGiftType: [{ giftTypeId: data.gift.id, giftTypeName: data.gift.name,
      redeemed: data.gift.redeemed, remaining: data.gift.remaining, rehearsal: false }],
      byDay: [{ date: data.date, value: data.gift.redeemed }], byStation: [{ stationId: 'station', stationName: room, value: data.gift.redeemed }] },
    safety: { incidents: [{ id: 'campaign-incident', type: 'SAFETY_CONCERN', severity: 'MEDIUM', status: 'RESOLVED', stationName: room,
      occurredAt: input.now, reportedAt: input.now, description: incidentDescription, followUpCount: 1 }],
      incidentsByType: [{ key: 'SAFETY_CONCERN', value: 1 }], nearMisses: 0,
      lostPerson: { cases: 1, resolved: 1, medianResolutionMinutes: 7, byOutcome: [{ outcome: 'RESOLVED_FOUND', value: 1 }] },
      lostAndFound: { logged: 2, claimed: 1, unclaimed: 1 } },
    volunteers: { volunteersActive: 2, assignments: 2, checkedIn: 1, noShows: 0, notYetDue: 1, noShowRate: 0, totalHours: 2,
      byStation: [{ stationId: 'station', stationName: room, assignments: 2, checkedIn: 1, hours: 2 }] },
    dataIntegrity: { containsFallbackData: true, fallbackWindows: [fallback], degradedMinutes: 30,
      recordsBySource: [{ table: 'Registration', source: 'APP', value: 15 }, { table: 'Registration', source: 'PAPER', value: 5 },
        { table: 'FootfallTick', source: 'APP', value: 10 }, { table: 'FootfallTick', source: 'FALLBACK_SHEET', value: 2 }],
      imports: [{ id: 'campaign-import', source: 'FALLBACK_SHEET', targetTable: 'FootfallTick', rowCount: 2,
        fileName: 'synthetic-counts.csv', importedAt: input.now, notes: 'Reviewed against the signed sheet.' }],
      voidedRecords: [{ table: 'Registration', value: 1 }] } });
}

function reportResponses(input: CampaignContext, data: OperationalData): CampaignResponse[] {
  const report = frozenReport(input, data);
  const snapshots = ReportSnapshotsResponse.parse({ data: [{ ...report.snapshot!, rehearsalIncluded: false,
    range: report.range, supersededAt: null }], meta: { count: 1, nextCursor: null } });
  const pack = ArchiveExportRecord.parse({ id: 'campaign-export-pack', eventId: input.eventId, snapshotId,
    objectKey: 'synthetic/campaign-export-pack.xlsx', createdAt: input.now, downloadPath: '/reports/archive-export/campaign-export-pack' });
  return [{ path: '/reports/summary', body: report },
    { path: '/reports/snapshots', query: { limit: '20' }, body: snapshots },
    { path: `/reports/snapshots/${snapshotId}`, body: report },
    { path: '/reports/archive-exports', body: { data: [pack] } }];
}

/** Exact relative GET request keys; the installer rejects any unmatched method, path or query. */
export function campaignOperationalResponses(input: CampaignContext): CampaignResponse[] {
  const data = operationalData(input);
  return [...dashboardResponses(input, data), ...countResponses(input, data), ...safetyResponses(input), ...reportResponses(input, data)];
}
