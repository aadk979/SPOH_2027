import { describe, expect, it } from 'vitest';
import { RecentCorrectionRecordsQuery } from './index.js';

describe('recent correction queries', () => {
  it('requires a chosen station and defaults to live records with bounded pagination', () => {
    expect(RecentCorrectionRecordsQuery.parse({ stationId: 'station' })).toEqual({
      stationId: 'station', limit: 50, rehearsal: false,
    });
    expect(RecentCorrectionRecordsQuery.safeParse({}).success).toBe(false);
    expect(RecentCorrectionRecordsQuery.safeParse({ stationId: 'station', limit: 1001 }).success).toBe(false);
  });

  it('coerces explicit mode and pagination without accepting arbitrary query keys', () => {
    expect(RecentCorrectionRecordsQuery.parse({ stationId: 'station', rehearsal: 'true', limit: '2', cursor: 'previous' })).toEqual({
      stationId: 'station', rehearsal: true, limit: 2, cursor: 'previous',
    });
    for (const extra of [{ rehearsal: '1' }, { rehearsal: true }, { volunteerId: 'someone' }]) {
      expect(RecentCorrectionRecordsQuery.safeParse({ stationId: 'station', ...extra }).success).toBe(false);
    }
  });
});
