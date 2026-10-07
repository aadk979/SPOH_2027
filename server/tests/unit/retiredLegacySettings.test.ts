import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, SCOPED_OPERATIONAL_KEYS, scopedOperationalKeys } from '@spoh/shared';

const store = vi.hoisted(() => ({
  updateSettings: vi.fn(),
  getSettings: vi.fn(),
  settingsMeta: vi.fn(),
}));
vi.mock('../../src/platform/settings/index.js', () => store);
vi.mock('../../src/modules/settings/data/repo.js', () => ({ findVolunteerName: vi.fn() }));

import { ValidationError } from '../../src/platform/errors/index.js';
import { SETTINGS } from '../../src/platform/settings/registry.js';
import {
  assertNoRetiredLegacyKeys,
  RETIRED_LEGACY_SETTING_KEYS,
} from '../../src/modules/settings/domain/retiredLegacySettings.js';
import { updateSettingsView } from '../../src/modules/settings/application/settingsView.js';

const actor = {
  volunteerId: 'person-1',
  displayName: 'Chief',
  audit: {},
} as unknown as Parameters<typeof updateSettingsView>[1];

beforeEach(() => {
  store.updateSettings.mockReset();
  store.getSettings.mockReset();
  store.settingsMeta.mockReset().mockReturnValue({
    overriddenKeys: [],
    updatedAt: null,
    updatedById: null,
  });
});

describe('retired legacy setting keys', () => {
  it('are exactly the thresholds and the capture and outbox keys', () => {
    expect([...RETIRED_LEGACY_SETTING_KEYS].sort()).toEqual([
      'captureSendGraceSeconds',
      'captureUndoWindowSeconds',
      'implausibleTapsPerMinute',
      'longShiftMinutes',
      'outboxWarningAgeMinutes',
      'outboxWarningCount',
      'silentStationMinutes',
      'staleDeviceMinutes',
    ]);
  });

  it.each(RETIRED_LEGACY_SETTING_KEYS)(
    '%s is editable in the scoped catalogue at every event-capable scope',
    (key) => {
      expect(SCOPED_OPERATIONAL_KEYS).toContain(key);
      expect(SETTINGS[key].requiredAction).toBe('event.settings.manage');
      expect(scopedOperationalKeys('event')).toContain(key);
      const stationAllowed = (SETTINGS[key].scopes as readonly string[]).includes('station');
      expect(scopedOperationalKeys('station').includes(key)).toBe(stationAllowed);
    },
  );

  it('names only the retired keys and the catalogue that replaces them', () => {
    let caught: unknown;
    try {
      assertNoRetiredLegacyKeys({
        outboxWarningCount: 30,
        longShiftMinutes: 90,
        alertPollSeconds: 12,
        staleDeviceMinutes: 5,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      details: {
        keys: ['staleDeviceMinutes', 'longShiftMinutes', 'outboxWarningCount'],
        replacement: '/admin/settings/catalogue',
      },
    });
  });

  it('allows every other legacy key', () => {
    expect(() =>
      assertNoRetiredLegacyKeys({
        eventName: 'Event',
        lostPersonPurgeHours: 12,
        alertPollSeconds: 9,
      }),
    ).not.toThrow();
  });

  it('rejects before any write or cache refresh, whole body at once', async () => {
    await expect(
      updateSettingsView({ lostPersonPurgeHours: 12, silentStationMinutes: 4 }, actor),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  it('passes a permitted body through unchanged', async () => {
    store.updateSettings.mockResolvedValue({ lostPersonPurgeHours: 12 });
    await updateSettingsView({ lostPersonPurgeHours: 12 }, actor);
    expect(store.updateSettings).toHaveBeenCalledWith({ lostPersonPurgeHours: 12 }, 'person-1', {});
  });
});
