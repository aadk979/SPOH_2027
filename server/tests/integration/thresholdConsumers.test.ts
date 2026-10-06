import {
  DataHealthResponse,
  FootfallLiveResponse,
  LiveDashboardResponse,
  StationDashboardResponse,
} from '@spoh/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDataHealth } from '../../src/modules/dashboard/application/getDataHealth.js';
import { getLiveDashboard } from '../../src/modules/dashboard/application/getLiveDashboard.js';
import { getStationDashboard } from '../../src/modules/dashboard/application/getStationDashboard.js';
import { getLiveFootfall } from '../../src/modules/footfall/index.js';
import { getLongShifts } from '../../src/modules/shift/index.js';
import { overrideSettingsForTest } from '../../src/platform/settings/index.js';
import { prepareThresholds } from '../../src/platform/settings/thresholds.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

type Layer = 'PLATFORM' | 'EVENT' | 'STATION';
const minutesAgo = (minutes: number) => new Date(FROZEN_NOW.getTime() - minutes * 60_000);

let eventId: string;
let organisationId: string;
let eventDayId: string;
let roomA: string;
let roomB: string;
let booth: string;
let counter: TestVolunteer;
let otherEventId: string;

/** A stored override, written the way the migration or catalogue would, or raw when the scope is not allowed. */
async function store(
  layer: Layer,
  key: string,
  value: unknown,
  stationId?: string,
  owner = eventId,
) {
  await rawDb.setting.create({
    data: {
      scope: layer,
      scopeId: layer === 'PLATFORM' ? organisationId : layer === 'EVENT' ? owner : stationId!,
      eventId: layer === 'PLATFORM' ? null : owner,
      key,
      value: value as never,
      version: 1,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  organisationId = (await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).organisationId;
  otherEventId = (
    await rawDb.event.create({
      data: {
        organisationId,
        slug: 'other-threshold-event',
        name: 'Other',
        timezone: 'Asia/Singapore',
      },
    })
  ).id;
  eventDayId = (await createEventDayToday()).id;
  booth = (await createStation({ code: 'BOOTH', name: 'Booth' })).id;
  roomA = (await createStation({ code: 'ROOM_A', name: 'Room A', countsEntry: true })).id;
  roomB = (await createStation({ code: 'ROOM_B', name: 'Room B', countsEntry: true })).id;
  counter = await createVolunteer({ email: 'counter@threshold.test', role: 'VOLUNTEER' });
  await assignToStationAllBlocks({ volunteerId: counter.id, stationId: roomA, eventDayId });
});

async function tick(stationId: string, minutes: number) {
  await rawDb.footfallTick.create({
    data: {
      eventId,
      stationId,
      recordedById: counter.id,
      quantity: 1,
      idempotencyKey: idempotencyKey(),
      recordedAt: minutesAgo(minutes),
    },
  });
}
const silentNames = async () =>
  (await getLiveFootfall({ eventId }, FROZEN_NOW)).stations
    .filter((station) => station.silent)
    .map((station) => station.stationName)
    .sort();

describe('live footfall silence', () => {
  beforeEach(async () => {
    await tick(roomA, 20);
    await tick(roomB, 20);
  });

  it('uses the compiled default when nothing is stored', async () => {
    expect(await silentNames()).toEqual(['Room A', 'Room B']);
  });

  it('resolves station, then event, then platform, then default, per station', async () => {
    await store('PLATFORM', 'silentStationMinutes', 30);
    expect(await silentNames()).toEqual([]);
    await store('EVENT', 'silentStationMinutes', 25);
    await store('STATION', 'silentStationMinutes', 10, roomA);
    expect(await silentNames()).toEqual(['Room A']);
    await rawDb.setting.deleteMany({ where: { scope: 'EVENT', key: 'silentStationMinutes' } });
    // Platform (30) now sits behind Room A's own 10 and applies to Room B.
    expect(await silentNames()).toEqual(['Room A']);
    await rawDb.setting.deleteMany({ where: { scope: 'PLATFORM', key: 'silentStationMinutes' } });
    expect(await silentNames()).toEqual(['Room A', 'Room B']);
  });

  it('falls an invalid station value through to the event value', async () => {
    await store('EVENT', 'silentStationMinutes', 30);
    await store('STATION', 'silentStationMinutes', 'ten', roomA);
    expect(await silentNames()).toEqual([]);
    await rawDb.setting.deleteMany({ where: { scope: 'EVENT' } });
    await rawDb.setting.update({
      where: {
        scope_scopeId_key: { scope: 'STATION', scopeId: roomA, key: 'silentStationMinutes' },
      },
      data: { value: 0 },
    });
    expect(await silentNames()).toEqual(['Room A', 'Room B']);
  });

  it('ignores another event, and a station row that names another event', async () => {
    await store('EVENT', 'silentStationMinutes', 60, undefined, otherEventId);
    await store('STATION', 'silentStationMinutes', 60, roomA, otherEventId);
    expect(await silentNames()).toEqual(['Room A', 'Room B']);
  });

  it('is not governed by the legacy global cache', async () => {
    const restore = overrideSettingsForTest({ silentStationMinutes: 60 });
    try {
      expect(await silentNames()).toEqual(['Room A', 'Room B']);
    } finally {
      restore();
    }
  });

  it('keeps the response schema and flags a station exactly at the threshold', async () => {
    await store('EVENT', 'silentStationMinutes', 20);
    const response = await getLiveFootfall({ eventId }, FROZEN_NOW);
    expect(FootfallLiveResponse.safeParse(response).success).toBe(true);
    expect(response.stations.every((station) => station.silent)).toBe(true);
    await rawDb.setting.deleteMany({ where: { scope: 'EVENT' } });
    await store('EVENT', 'silentStationMinutes', 21);
    expect(await silentNames()).toEqual([]);
  });
});

describe('data health stale device', () => {
  beforeEach(async () => {
    await rawDb.shiftAssignment.updateMany({
      where: { volunteerId: counter.id },
      data: { checkedInAt: minutesAgo(60) },
    });
    await tick(roomA, 20);
  });
  const stale = async () => [
    ...new Set(
      (await getDataHealth({ eventId }, FROZEN_NOW)).staleDevices.map((row) => row.volunteerId),
    ),
  ];

  it('uses event, then the default; platform and station rows are not allowed', async () => {
    expect(await stale()).toEqual([counter.id]);
    await store('PLATFORM', 'staleDeviceMinutes', 40);
    await store('STATION', 'staleDeviceMinutes', 40, roomA);
    expect(await stale()).toEqual([counter.id]);
    await store('EVENT', 'staleDeviceMinutes', 21);
    expect(await stale()).toEqual([]);
    await rawDb.setting.update({
      where: { scope_scopeId_key: { scope: 'EVENT', scopeId: eventId, key: 'staleDeviceMinutes' } },
      data: { value: 20 },
    });
    expect(await stale()).toEqual([counter.id]);
  });

  it('falls an invalid event value through to the default and ignores the legacy cache', async () => {
    await store('EVENT', 'staleDeviceMinutes', 'soon');
    expect(await stale()).toEqual([counter.id]);
    const restore = overrideSettingsForTest({ staleDeviceMinutes: 90 });
    try {
      expect(await stale()).toEqual([counter.id]);
    } finally {
      restore();
    }
    expect(DataHealthResponse.safeParse(await getDataHealth({ eventId }, FROZEN_NOW)).success).toBe(
      true,
    );
  });
});

describe('long shifts', () => {
  beforeEach(async () => {
    await rawDb.shiftAssignment.updateMany({
      where: { volunteerId: counter.id },
      data: { checkedInAt: minutesAgo(200) },
    });
  });
  const warned = async () => [
    ...new Set((await getLongShifts({ eventId }, FROZEN_NOW)).map((row) => row.volunteerId)),
  ];

  it('uses event, then the default; platform and station rows are not allowed', async () => {
    expect(await warned()).toEqual([counter.id]);
    await store('PLATFORM', 'longShiftMinutes', 400);
    await store('STATION', 'longShiftMinutes', 400, roomA);
    expect(await warned()).toEqual([counter.id]);
    await store('EVENT', 'longShiftMinutes', 201);
    expect(await warned()).toEqual([]);
    await rawDb.setting.deleteMany({ where: { scope: 'EVENT' } });
    await store('EVENT', 'longShiftMinutes', 199);
    expect(await warned()).toEqual([counter.id]);
    // The existing comparison is strict: a shift of exactly the threshold is not yet long.
    await rawDb.setting.deleteMany({ where: { scope: 'EVENT' } });
    await store('EVENT', 'longShiftMinutes', 200);
    expect(await warned()).toEqual([]);
  });

  it('falls an invalid value through and ignores the legacy cache', async () => {
    await store('EVENT', 'longShiftMinutes', -5);
    expect(await warned()).toEqual([counter.id]);
    const restore = overrideSettingsForTest({ longShiftMinutes: 999 });
    try {
      expect(await warned()).toEqual([counter.id]);
    } finally {
      restore();
    }
  });
});

describe('station dashboard implausible taps', () => {
  beforeEach(async () => {
    const times = Array.from({ length: 30 }, () => FROZEN_NOW.getTime() - 5 * 60_000);
    const category = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId } });
    for (const at of times) {
      await rawDb.registration.create({
        data: {
          eventId,
          stationId: booth,
          recordedById: counter.id,
          categoryId: category.id,
          idempotencyKey: idempotencyKey(),
          recordedAt: new Date(at),
        },
      });
    }
  });
  const anomaly = async (stationId = booth) => {
    const response = await getStationDashboard({ eventId }, stationId, FROZEN_NOW);
    expect(StationDashboardResponse.safeParse(response).success).toBe(true);
    return response.registrations.byDevice.map((device) => device.rateAnomaly);
  };

  it('flags the default rate, then follows station, event and platform', async () => {
    // 30 registrations in one active minute is 30 per minute.
    expect(await anomaly()).toEqual([true]);
    await store('PLATFORM', 'implausibleTapsPerMinute', 50);
    expect(await anomaly()).toEqual([false]);
    await store('EVENT', 'implausibleTapsPerMinute', 20);
    expect(await anomaly()).toEqual([true]);
    await store('STATION', 'implausibleTapsPerMinute', 35, booth);
    expect(await anomaly()).toEqual([false]);
  });

  it('falls an invalid station value through, and ignores another station and the legacy cache', async () => {
    await store('EVENT', 'implausibleTapsPerMinute', 40);
    await store('STATION', 'implausibleTapsPerMinute', 'x', booth);
    await store('STATION', 'implausibleTapsPerMinute', 1, roomA);
    expect(await anomaly()).toEqual([false]);
    const restore = overrideSettingsForTest({ implausibleTapsPerMinute: 1 });
    try {
      expect(await anomaly()).toEqual([false]);
    } finally {
      restore();
    }
  });

  it('answers 404 for a station of another event without consulting its settings', async () => {
    await expect(
      getStationDashboard({ eventId: otherEventId }, booth, FROZEN_NOW),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('live dashboard composition', () => {
  it('uses one threshold observation for the footfall and data-health panels', async () => {
    await tick(roomA, 20);
    await tick(roomB, 20);
    await store('EVENT', 'silentStationMinutes', 30);
    await store('STATION', 'silentStationMinutes', 10, roomA);
    const response = await getLiveDashboard({ eventId }, FROZEN_NOW);
    expect(LiveDashboardResponse.safeParse(response).success).toBe(true);
    const direct = response.footfall.stations.filter((s) => s.silent).map((s) => s.stationId);
    expect(direct).toEqual([roomA]);
    expect(response.dataHealth.silentStations.map((s) => s.stationId)).toEqual(direct);
  });

  it('prepares a snapshot once and resolves every row from it', async () => {
    await store('STATION', 'silentStationMinutes', 10, roomA);
    const snapshot = await prepareThresholds({ eventId });
    await rawDb.setting.deleteMany({});
    expect(snapshot.silentStationMinutes(roomA)).toBe(10);
    expect(snapshot.silentStationMinutes(roomB)).toBe(15);
    const response = await getLiveFootfall({ eventId }, FROZEN_NOW, { thresholds: snapshot });
    expect(response.stations.find((s) => s.stationId === roomA)).toBeDefined();
  });
});
