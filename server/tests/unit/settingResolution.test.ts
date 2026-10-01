import { describe, expect, it } from 'vitest';
import { resolveSetting } from '../../src/platform/settings/resolve.js';

describe('setting resolution (P10.2)', () => {
  const key = 'silentStationMinutes';

  it('uses station, event, platform, then the compiled default', () => {
    const platform = { scope: 'platform' as const, value: 30, version: 1 };
    const event = { scope: 'event' as const, value: 20, version: 2 };
    const station = { scope: 'station' as const, value: 10, version: 3 };
    expect(resolveSetting(key, [platform, event, station])).toMatchObject({
      value: 10,
      source: 'station',
      version: 3,
    });
    expect(resolveSetting(key, [platform, event])).toMatchObject({
      value: 20,
      source: 'event',
      version: 2,
    });
    expect(resolveSetting(key, [platform])).toMatchObject({
      value: 30,
      source: 'platform',
      version: 1,
    });
    expect(resolveSetting(key, [])).toMatchObject({
      value: 15,
      source: 'default',
      version: 0,
    });
  });

  it('skips an invalid stored layer and reports it for the settings screen', () => {
    expect(
      resolveSetting(key, [
        { scope: 'station', value: 0, version: 4 },
        { scope: 'event', value: 12, version: 2 },
      ]),
    ).toEqual({
      key,
      value: 12,
      source: 'event',
      version: 2,
      invalidScopes: ['station'],
    });
  });

  it('ignores a scope that the key does not permit', () => {
    expect(
      resolveSetting('refreshSessionDays', [
        { scope: 'event', value: 1, version: 1 },
        { scope: 'platform', value: 14, version: 2 },
      ]),
    ).toMatchObject({ value: 14, source: 'platform' });
  });
});
