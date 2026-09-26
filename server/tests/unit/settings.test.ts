import { describe, expect, it } from 'vitest';
import { RuntimeSettings, UpdateSettingsRequest } from '@spoh/shared';
import {
  DEFAULT_SETTINGS,
  getSettings,
  overrideSettingsForTest,
} from '../../src/platform/settings/index.js';
import {
  activeShiftBlocks,
  shiftBlockRanges,
  singaporeHourKey,
} from '../../src/platform/time/index.js';

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

  it('reproduce the shipped shift boundaries', () => {
    // 09:30-14:00 and 13:30-18:00 (BUILD_PLAN §1.1), overlapping deliberately.
    expect(shiftBlockRanges().MORNING).toEqual({ startMinute: 570, endMinute: 840 });
    expect(shiftBlockRanges().AFTERNOON).toEqual({ startMinute: 810, endMinute: 1080 });
  });
});

describe('a changed shift boundary changes who is on shift', () => {
  /**
   * The reason these are configurable at all. Station scoping asks whether a
   * block is running, so moving a boundary decides whether the capture screens
   * accept anything — and a rehearsal moved to an evening should not need a
   * deploy.
   */
  it('reports no block when the configured window has passed', () => {
    const restore = overrideSettingsForTest({
      shiftBlocks: {
        MORNING: { start: '06:00', end: '07:00' },
        AFTERNOON: { start: '19:00', end: '20:00' },
      },
    });

    try {
      // 11:30 Singapore: inside the shipped morning block, outside this one.
      expect(activeShiftBlocks(new Date('2027-01-07T03:30:00Z'), false)).toEqual([]);
    } finally {
      restore();
    }
  });

  it('reports a block when the configured window covers the instant', () => {
    const restore = overrideSettingsForTest({
      shiftBlocks: {
        MORNING: { start: '06:00', end: '07:00' },
        AFTERNOON: { start: '19:00', end: '20:00' },
      },
    });

    try {
      // 06:30 Singapore.
      expect(activeShiftBlocks(new Date('2027-01-06T22:30:00Z'), false)).toEqual(['MORNING']);
    } finally {
      restore();
    }
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

  it('rejects a shift block that ends before it starts', () => {
    const result = UpdateSettingsRequest.safeParse({
      shiftBlocks: {
        MORNING: { start: '14:00', end: '09:30' },
        AFTERNOON: { start: '13:30', end: '18:00' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a time that is not a 24-hour clock reading', () => {
    const result = UpdateSettingsRequest.safeParse({
      shiftBlocks: {
        MORNING: { start: '9:30am', end: '14:00' },
        AFTERNOON: { start: '13:30', end: '18:00' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a threshold outside its range', () => {
    expect(UpdateSettingsRequest.safeParse({ silentStationMinutes: 0 }).success).toBe(false);
    expect(UpdateSettingsRequest.safeParse({ dashboardPollSeconds: 99_999 }).success).toBe(false);
  });
});

describe('report hour labels', () => {
  /**
   * The bucket boundaries were always right — Singapore is UTC+8 exactly — but
   * the label was in UTC, so a reader looking for the 11am rush had to shift
   * every row by eight hours in their head.
   */
  it('labels a bucket with the local hour the event experienced', () => {
    expect(singaporeHourKey(new Date('2027-01-07T03:00:00Z'))).toBe('2027-01-07T11');
  });

  it('rolls the local date over correctly across midnight UTC', () => {
    expect(singaporeHourKey(new Date('2027-01-06T17:00:00Z'))).toBe('2027-01-07T01');
  });
});
