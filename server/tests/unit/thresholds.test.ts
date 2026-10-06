import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ event: vi.fn(), settings: vi.fn() }));
vi.mock('../../src/platform/db/client.js', () => ({
  prisma: {
    event: { findUnique: db.event },
    setting: { findMany: db.settings },
  },
}));

import { prepareThresholds } from '../../src/platform/settings/thresholds.js';

const row = (
  scope: 'PLATFORM' | 'EVENT' | 'STATION',
  key: string,
  value: unknown,
  scopeId = '',
) => ({
  scope,
  scopeId,
  key,
  value,
  version: 1,
});

beforeEach(() => {
  db.event.mockReset().mockResolvedValue({ organisationId: 'org-1' });
  db.settings.mockReset().mockResolvedValue([]);
});

describe('threshold snapshot', () => {
  it('falls back to the compiled defaults', async () => {
    const snapshot = await prepareThresholds({ eventId: 'evt-1' });
    expect([
      snapshot.silentStationMinutes('s1'),
      snapshot.staleDeviceMinutes(),
      snapshot.implausibleTapsPerMinute('s1'),
      snapshot.longShiftMinutes(),
    ]).toEqual([15, 15, 20, 180]);
  });

  it('reads every permitted layer in one bounded statement naming only this event and organisation', async () => {
    await prepareThresholds({ eventId: 'evt-1' });
    expect(db.settings).toHaveBeenCalledTimes(1);
    expect(db.settings.mock.calls[0]![0].where).toEqual({
      key: {
        in: [
          'silentStationMinutes',
          'staleDeviceMinutes',
          'implausibleTapsPerMinute',
          'longShiftMinutes',
        ],
      },
      OR: [
        { scope: 'EVENT', scopeId: 'evt-1', eventId: 'evt-1' },
        { scope: 'STATION', eventId: 'evt-1' },
        { scope: 'PLATFORM', scopeId: 'org-1', eventId: null },
      ],
    });
  });

  it('applies station, then event, then platform per station', async () => {
    db.settings.mockResolvedValue([
      row('PLATFORM', 'silentStationMinutes', 40, 'org-1'),
      row('EVENT', 'silentStationMinutes', 30, 'evt-1'),
      row('STATION', 'silentStationMinutes', 5, 's1'),
      row('PLATFORM', 'implausibleTapsPerMinute', 50, 'org-1'),
    ]);
    const snapshot = await prepareThresholds({ eventId: 'evt-1' });
    expect(snapshot.silentStationMinutes('s1')).toBe(5);
    expect(snapshot.silentStationMinutes('s2')).toBe(30);
    expect(snapshot.implausibleTapsPerMinute('s2')).toBe(50);
  });

  it('ignores platform and station rows for event-only keys', async () => {
    db.settings.mockResolvedValue([
      row('PLATFORM', 'staleDeviceMinutes', 99, 'org-1'),
      row('STATION', 'staleDeviceMinutes', 98, 's1'),
      row('PLATFORM', 'longShiftMinutes', 97, 'org-1'),
      row('STATION', 'longShiftMinutes', 96, 's1'),
    ]);
    const snapshot = await prepareThresholds({ eventId: 'evt-1' });
    expect(snapshot.staleDeviceMinutes()).toBe(15);
    expect(snapshot.longShiftMinutes()).toBe(180);
  });

  it('falls an invalid stored value through to the next layer', async () => {
    db.settings.mockResolvedValue([
      row('EVENT', 'silentStationMinutes', 30, 'evt-1'),
      row('STATION', 'silentStationMinutes', 'soon', 's1'),
      row('EVENT', 'longShiftMinutes', 0, 'evt-1'),
    ]);
    const snapshot = await prepareThresholds({ eventId: 'evt-1' });
    expect(snapshot.silentStationMinutes('s1')).toBe(30);
    expect(snapshot.longShiftMinutes()).toBe(180);
  });

  it('is an immutable observation: later reads do not change it', async () => {
    db.settings.mockResolvedValue([row('EVENT', 'longShiftMinutes', 60, 'evt-1')]);
    const snapshot = await prepareThresholds({ eventId: 'evt-1' });
    db.settings.mockResolvedValue([row('EVENT', 'longShiftMinutes', 90, 'evt-1')]);
    expect(snapshot.longShiftMinutes()).toBe(60);
    expect(db.settings).toHaveBeenCalledTimes(1);
  });
});
