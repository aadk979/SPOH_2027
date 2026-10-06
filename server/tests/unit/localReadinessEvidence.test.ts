import { describe, expect, it } from 'vitest';
import { localReadinessEvidence } from '../../src/modules/event/application/localReadinessEvidence.js';
import {
  evaluateGoLiveReadiness,
  toGoLiveChecks,
} from '../../src/modules/event/domain/readiness/index.js';
import { goLiveCheckBlockers } from '../../src/modules/event/domain/goLiveChecks.js';
import { CONTEXT, EVIDENCE } from './eventReadinessFixtures.js';

const context = {
  ...CONTEXT,
  deploymentId: null,
  databaseId: null,
  requiredAlarmIds: [],
  freshness: null,
};
const snapshot = () => ({
  eventId: context.eventId,
  coverage: structuredClone(EVIDENCE['shift-coverage'].facts),
  categories: EVIDENCE.categories.facts,
  cardBatch: EVIDENCE['card-batch'].facts,
  giftStock: EVIDENCE['gift-stock'].facts,
  attendance: {
    rootValue: 'root-a',
    networksValue: ['203.0.113.0/24'],
    root: { id: 'root-a', role: 'ADMIN', status: 'ACTIVE' },
  },
});
const evaluate = (raw: unknown) =>
  evaluateGoLiveReadiness(context, localReadinessEvidence(raw, context.eventId));
const attendance = (raw: unknown) => evaluate(raw).find((item) => item.code === 'attendance');

describe('real local readiness evidence mapping', () => {
  it('maps five current items while six absent domains remain unavailable and nonwaivable', () => {
    const items = evaluate(snapshot());
    expect(items.filter((item) => item.state === 'passed').map((item) => item.code)).toEqual([
      'shift-coverage',
      'categories',
      'card-batch',
      'gift-stock',
      'attendance',
    ]);
    for (const item of items.filter((item) => item.state === 'unavailable')) {
      expect(
        goLiveCheckBlockers(toGoLiveChecks(items), {
          platformAdmin: true,
          goLiveOverrides: [{ code: item.code, reason: 'Reviewed current readiness' }],
        }),
      ).toContain('go-live:' + item.code + ':missing');
    }
  });

  it.each([null, {}, { ...snapshot(), eventId: 'other-event' }, { ...snapshot(), passed: true }])(
    'rejects absent, foreign or forged top-level snapshots',
    (raw) => expect(evaluate(raw).every((item) => item.state === 'unavailable')).toBe(true),
  );

  it.each([null, 3, '', { id: 'root-a' }])(
    'never coerces malformed root selectors',
    (rootValue) => {
      expect(
        attendance({ ...snapshot(), attendance: { ...snapshot().attendance, rootValue } }),
      ).toMatchObject({ state: 'failed', reasons: ['attendance-root-invalid'] });
    },
  );

  it('does not treat a different membership as the configured root', () => {
    const raw = snapshot();
    raw.attendance.root.id = 'foreign-root';
    expect(attendance(raw)).toMatchObject({
      state: 'failed',
      reasons: ['attendance-root-invalid'],
    });
  });

  it.each([null, ['not-a-cidr'], ['203.0.113.0/24', 'invalid']])(
    'counts no trusted range when the stored list is schema-invalid',
    (networksValue) => {
      expect(
        attendance({
          ...snapshot(),
          attendance: { ...snapshot().attendance, networksValue },
        }),
      ).toMatchObject({ state: 'failed', reasons: ['attendance-networks-empty'] });
    },
  );

  it('isolates a malformed item without changing good independent facts', () => {
    const items = evaluate({ ...snapshot(), giftStock: { gifts: [{ initialStock: -1 }] } });
    expect(items.find((item) => item.code === 'gift-stock')).toMatchObject({
      state: 'unavailable',
    });
    expect(items.find((item) => item.code === 'categories')).toMatchObject({ state: 'passed' });
  });

  it.each([
    ['adjustment', Number.MAX_SAFE_INTEGER + 1],
    ['adjustment', 10n],
    ['redeemed', -1],
    ['redeemed', 2.5],
    ['initialStock', 10n],
  ])(
    'never coerces an unsafe or malformed %s aggregate into a known stock decision',
    (field, value) => {
      const raw = snapshot();
      const giftStock = { gifts: [{ ...raw.giftStock.gifts[0], [field as string]: value }] };
      expect(
        evaluate({ ...raw, giftStock }).find((item) => item.code === 'gift-stock'),
      ).toMatchObject({ state: 'unavailable' });
    },
  );

  it('preserves a legitimate negative adjustment as a current stock failure', () => {
    const raw = snapshot();
    const giftStock = { gifts: [{ ...raw.giftStock.gifts[0], adjustment: -20 }] };
    expect(
      evaluate({ ...raw, giftStock }).find((item) => item.code === 'gift-stock'),
    ).toMatchObject({ state: 'failed', reasons: ['live-gift-stock-empty'] });
  });

  it('treats an incoherent raw root record as unavailable, rather than a waivable failure', () => {
    const raw = snapshot();
    const items = evaluate({
      ...raw,
      attendance: { ...raw.attendance, root: { ...raw.attendance.root, personActive: true } },
    });
    expect(items.find((item) => item.code === 'attendance')).toMatchObject({
      state: 'unavailable',
    });
  });

  it('returns only bounded decisions without raw identifiers or attendance/card fields', () => {
    expect(JSON.stringify(evaluate(snapshot()))).not.toMatch(
      /event-a|root-a|member-a|person-a|203\.0\.113|live-batch|gift-a|initialStock|rootValue/,
    );
  });
});
