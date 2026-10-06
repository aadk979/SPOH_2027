import type { ReadinessContext } from '../../src/modules/event/domain/readiness/index.js';

export const NOW = Date.parse('2026-10-06T00:00:00Z');
export const CONTEXT: ReadinessContext = {
  eventId: 'event-a',
  evaluatedAtMs: NOW,
  deploymentId: 'accepted-release',
  databaseId: 'staging-database',
  requiredAlarmIds: ['alarm-api', 'alarm-worker'],
  freshness: { smokeMaxAgeMs: 60_000, backupMaxAgeMs: 60_000, alarmsMaxAgeMs: 60_000 },
};
export const envelope = <T>(facts: T) => ({ eventId: CONTEXT.eventId, facts });

export const COVERAGE = {
  dayIds: ['day-a', 'day-b'],
  templateIds: ['template-a', 'template-b'],
  stationIds: ['station-a', 'station-b'],
  shifts: [
    { id: 'shift-aa', dayId: 'day-a', templateId: 'template-a' },
    { id: 'shift-ab', dayId: 'day-a', templateId: 'template-b' },
    { id: 'shift-ba', dayId: 'day-b', templateId: 'template-a' },
    { id: 'shift-bb', dayId: 'day-b', templateId: 'template-b' },
  ],
  memberships: [
    { id: 'member-a', personId: 'person-a', status: 'ACTIVE' },
    { id: 'member-b', personId: 'person-b', status: 'ACTIVE' },
  ],
  assignments: [
    {
      shiftId: 'shift-aa',
      dayId: 'day-a',
      stationId: 'station-a',
      membershipId: 'member-a',
      personId: 'person-a',
    },
    {
      shiftId: 'shift-aa',
      dayId: 'day-a',
      stationId: 'station-b',
      membershipId: 'member-b',
      personId: 'person-b',
    },
    {
      shiftId: 'shift-ab',
      dayId: 'day-a',
      stationId: 'station-a',
      membershipId: 'member-a',
      personId: 'person-a',
    },
    {
      shiftId: 'shift-ab',
      dayId: 'day-a',
      stationId: 'station-b',
      membershipId: 'member-b',
      personId: 'person-b',
    },
    {
      shiftId: 'shift-ba',
      dayId: 'day-b',
      stationId: 'station-a',
      membershipId: 'member-a',
      personId: 'person-a',
    },
    {
      shiftId: 'shift-ba',
      dayId: 'day-b',
      stationId: 'station-b',
      membershipId: 'member-b',
      personId: 'person-b',
    },
    {
      shiftId: 'shift-bb',
      dayId: 'day-b',
      stationId: 'station-a',
      membershipId: 'member-a',
      personId: 'person-a',
    },
    {
      shiftId: 'shift-bb',
      dayId: 'day-b',
      stationId: 'station-b',
      membershipId: 'member-b',
      personId: 'person-b',
    },
  ],
};

export const EVIDENCE = {
  'shift-coverage': envelope(COVERAGE),
  categories: envelope({ activeCategories: 2 }),
  'card-batch': envelope({
    batches: [{ batchLabel: 'live-batch', rehearsal: false, unissuedCards: 10 }],
  }),
  'gift-stock': envelope({
    gifts: [
      {
        id: 'gift-a',
        active: true,
        initialStock: 10,
        adjustment: 2,
        redeemed: 3,
        rehearsal: false,
      },
    ],
  }),
  content: envelope({
    requiredKeys: ['guide', 'map'],
    documents: [
      { key: 'guide', publishedVersion: 'version-1', publishedAtMs: NOW - 1 },
      { key: 'map', publishedVersion: 'version-2', publishedAtMs: NOW - 1 },
    ],
  }),
  attendance: envelope({
    root: { role: 'ADMIN', status: 'ACTIVE' },
    validatedTrustedNetworks: 1,
  }),
  'role-permissions': envelope({
    grantsVersion: 3,
    reviewedGrantsVersion: 3,
    reviewedAtMs: NOW - 1,
  }),
  notifications: envelope({ transportConfigured: true, settingsValid: true }),
  'staging-smoke': envelope({
    deploymentId: CONTEXT.deploymentId,
    observedAtMs: NOW - 1,
    passed: true,
  }),
  backups: envelope({
    databaseId: CONTEXT.databaseId,
    observedAtMs: NOW - 1,
    restorableThroughMs: NOW - 1,
  }),
  alarms: envelope({
    deploymentId: CONTEXT.deploymentId,
    observedAtMs: NOW - 1,
    alarms: [
      { id: 'alarm-api', state: 'OK' },
      { id: 'alarm-worker', state: 'OK' },
    ],
  }),
};
