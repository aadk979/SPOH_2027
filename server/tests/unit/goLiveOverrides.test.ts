import { describe, expect, it } from 'vitest';
import { TransitionEventRequest } from '@spoh/shared';
import {
  GO_LIVE_CHECKS,
  goLiveCheckBlockers,
} from '../../src/modules/event/domain/goLiveChecks.js';

const REASON = 'The readiness failure has been reviewed and accepted';
const checks = (failed: string = '') =>
  GO_LIVE_CHECKS.map((code) => ({ code, passed: code !== failed }));
const body = (patch: object = {}) => ({
  to: 'LIVE',
  expectedVersion: 0,
  idempotencyKey: 'd3db614a-0791-47c3-b040-1f83aa2a6ef9',
  goLiveOverrides: [{ code: 'attendance', reason: REASON }],
  ...patch,
});

describe('go-live per-item overrides', () => {
  it.each(GO_LIVE_CHECKS)('allows a platform admin to acknowledge the failing %s item', (code) => {
    expect(
      goLiveCheckBlockers(checks(code), {
        platformAdmin: true,
        goLiveOverrides: [{ code, reason: REASON }],
      }),
    ).toEqual([]);
  });

  it('requires current platform authority and an item-specific reason', () => {
    expect(
      goLiveCheckBlockers(checks('attendance'), {
        platformAdmin: false,
        goLiveOverrides: [{ code: 'attendance', reason: REASON }],
      }),
    ).toEqual(['platform-admin-required', 'go-live:attendance']);
    expect(
      goLiveCheckBlockers(checks('attendance'), {
        platformAdmin: true,
        goLiveOverrides: [{ code: 'attendance', reason: '   ' }],
      }),
    ).toEqual(['go-live:attendance:reason-required', 'go-live:attendance']);
  });

  it('cannot waive another failed item with a reason for a different item', () => {
    const multiple = checks('attendance').map((check) => ({
      ...check,
      passed: check.passed && check.code !== 'backups',
    }));
    expect(
      goLiveCheckBlockers(multiple, {
        platformAdmin: true,
        goLiveOverrides: [{ code: 'attendance', reason: REASON }],
      }),
    ).toEqual(['go-live:backups']);
  });

  it('cannot fabricate an unavailable or missing checklist result', () => {
    const context = {
      platformAdmin: true,
      goLiveOverrides: [{ code: 'attendance' as const, reason: REASON }],
    };
    expect(goLiveCheckBlockers([], context)).toEqual(['go-live-checklist-unavailable']);
    expect(
      goLiveCheckBlockers(
        checks().filter((check) => check.code !== 'attendance'),
        context,
      ),
    ).toEqual(['go-live:attendance:not-failing', 'go-live:attendance:missing']);
  });

  it('refuses unnecessary and duplicate acknowledgements', () => {
    const item = { code: 'attendance' as const, reason: REASON };
    expect(goLiveCheckBlockers(checks(), { platformAdmin: true, goLiveOverrides: [item] })).toEqual(
      ['go-live:attendance:not-failing'],
    );
    expect(
      goLiveCheckBlockers(checks('attendance'), {
        platformAdmin: true,
        goLiveOverrides: [item, item],
      }),
    ).toEqual(['go-live:attendance:duplicate-override']);
  });
});

describe('transition override contract', () => {
  it('trims a written reason and preserves the known item', () => {
    const result = TransitionEventRequest.parse(
      body({ goLiveOverrides: [{ code: 'attendance', reason: ` ${REASON} ` }] }),
    );
    expect(result.goLiveOverrides).toEqual([{ code: 'attendance', reason: REASON }]);
  });

  it.each([
    { goLiveOverrides: [{ code: 'unknown', reason: REASON }] },
    { goLiveOverrides: [{ code: 'attendance', reason: '  ' }] },
    { goLiveOverrides: [{ code: 'attendance', reason: 'x'.repeat(501) }] },
    {
      goLiveOverrides: [
        { code: 'attendance', reason: REASON },
        { code: 'attendance', reason: REASON },
      ],
    },
    { goLiveOverrides: [{ code: 'attendance', reason: REASON, passed: true }] },
    { platformAdmin: true },
    { to: 'CLOSED' },
    { to: 'REHEARSAL' },
  ])('rejects invalid or client-owned authority %j', (patch) => {
    expect(TransitionEventRequest.safeParse(body(patch)).success).toBe(false);
  });
});
