import { describe, expect, it } from 'vitest';
import { RuntimeSettings, UpdateSettingsRequest } from '@spoh/shared';
import { DEFAULT_SETTINGS, getSettings } from '../../src/platform/settings/index.js';

/**
 * Runtime settings.
 *
 * The property that matters is that the compiled defaults are a complete,
 * valid, working configuration — because that is what an empty settings table,
 * a failed load and a fresh deployment all fall back to.
 */
describe('compiled defaults', () => {
  it('satisfy the schema they are served through', () => {
    expect(RuntimeSettings.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('cover every key, so nothing can be undefined at runtime', () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(Object.keys(RuntimeSettings.shape).sort());
  });

  it('are what an unconfigured server reports', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('the update schema', () => {
  it('accepts a partial patch', () => {
    expect(UpdateSettingsRequest.safeParse({ silentStationMinutes: 10 }).success).toBe(true);
  });

  it('rejects an empty patch, which would be a silent no-op', () => {
    expect(UpdateSettingsRequest.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown key rather than ignoring it', () => {
    expect(UpdateSettingsRequest.safeParse({ notASetting: 1 }).success).toBe(false);
  });

  it('no longer takes shift hours: they are the templates (ADR-002)', () => {
    const result = UpdateSettingsRequest.safeParse({
      shiftBlocks: { MORNING: { start: '09:30', end: '14:00' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a threshold outside its range', () => {
    expect(UpdateSettingsRequest.safeParse({ silentStationMinutes: 0 }).success).toBe(false);
    expect(UpdateSettingsRequest.safeParse({ dashboardPollSeconds: 99_999 }).success).toBe(false);
  });
});
