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
  GUARDED_LEGACY_SETTING_KEYS,
  ORGANISATION_LEGACY_SETTING_KEYS,
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

  it('sends lost-person retention to the guarded event settings, which cap it (D-16)', () => {
    expect([...GUARDED_LEGACY_SETTING_KEYS]).toEqual(['lostPersonPurgeHours']);
    expect(SETTINGS.lostPersonPurgeHours.scopes).toEqual(['event']);
    expect(SETTINGS.lostPersonPurgeHours.schema.safeParse(24).success).toBe(true);
    expect(SETTINGS.lostPersonPurgeHours.schema.safeParse(25).success).toBe(false);
    let caught: unknown;
    try {
      assertNoRetiredLegacyKeys({ lostPersonPurgeHours: 12, alertPollSeconds: 9 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_FAILED,
      details: { keys: ['lostPersonPurgeHours'], replacement: '/admin/event-settings' },
    });
  });

  it('sends the organisation-wide keys to their platform-admin editor (D-17)', () => {
    expect([...ORGANISATION_LEGACY_SETTING_KEYS].sort()).toEqual([
      'alertPollSeconds',
      'dashboardPollSeconds',
      'idempotencyRetentionDays',
      'refreshSessionDays',
    ]);
    for (const key of ORGANISATION_LEGACY_SETTING_KEYS)
      expect(SETTINGS[key].scopes).toEqual(['platform']);
    expect(() => assertNoRetiredLegacyKeys({ refreshSessionDays: 7 })).toThrow(
      expect.objectContaining({
        details: { keys: ['refreshSessionDays'], replacement: '/admin/organisation-settings' },
      }),
    );
  });

  it('leaves only the event name on the legacy endpoint', () => {
    expect(() => assertNoRetiredLegacyKeys({ eventName: 'Event' })).not.toThrow();
  });

  it('rejects before any write or cache refresh, whole body at once', async () => {
    await expect(
      updateSettingsView({ alertPollSeconds: 12, silentStationMinutes: 4 }, actor),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  it('passes a permitted body through unchanged', async () => {
    store.updateSettings.mockResolvedValue({ eventName: 'Dry run' });
    await updateSettingsView({ eventName: 'Dry run' }, actor);
    expect(store.updateSettings).toHaveBeenCalledWith({ eventName: 'Dry run' }, 'person-1', {});
  });
});
