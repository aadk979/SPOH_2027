import { describe, expect, it } from 'vitest';
import {
  assertTickNotVoided,
  bucketsByStation,
  liveStationRow,
} from '../../src/modules/footfall/domain/footfallRules.js';

/** Footfall rules (P06.5): pure, so tested without a database. */

const NOW = new Date('2027-01-07T03:30:00.000Z');
const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * 60_000);

describe('assertTickNotVoided', () => {
  it('refuses a tick that is already voided', () => {
    expect(() => assertTickNotVoided({ voided: false })).not.toThrow();
    expect(() => assertTickNotVoided({ voided: true })).toThrow(
      expect.objectContaining({ code: 'ALREADY_VOIDED', statusCode: 409 }),
    );
  });
});

describe('bucketsByStation', () => {
  it('groups bucket rows by station, keeping their order', () => {
    const at = (iso: string): Date => new Date(iso);
    const grouped = bucketsByStation([
      { stationId: 'a', bucket: at('2027-01-07T02:00:00.000Z'), total: 3 },
      { stationId: 'b', bucket: at('2027-01-07T02:00:00.000Z'), total: 1 },
      { stationId: 'a', bucket: at('2027-01-07T02:30:00.000Z'), total: 5 },
    ]);

    expect(grouped.get('a')).toEqual([
      { bucketStart: '2027-01-07T02:00:00.000Z', value: 3 },
      { bucketStart: '2027-01-07T02:30:00.000Z', value: 5 },
    ]);
    expect(grouped.get('b')).toHaveLength(1);
  });
});

describe('liveStationRow', () => {
  const station = { id: 'st', name: 'Room A' };
  const at = { now: NOW, silentAfterMinutes: 15 };

  it.each([
    ['no activity today', undefined, true, null],
    ['a tick 20 minutes ago', { total: 4, lastActivityAt: minutesAgo(20), counters: 1 }, true, 20],
    ['a tick 5 minutes ago', { total: 4, lastActivityAt: minutesAgo(5), counters: 2 }, false, 5],
  ])('%s → silent %s', (_label, stats, silent, minutes) => {
    const row = liveStationRow(station, stats, at);
    expect(row.silent).toBe(silent);
    expect(row.minutesSinceLastActivity).toBe(minutes);
    expect(row.todayTotal).toBe(stats?.total ?? 0);
  });
});
