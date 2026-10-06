import { describe, expect, it } from 'vitest';
import type { GoLiveCheckCode } from '@spoh/shared';
import { goLiveCheckBlockers } from '../../src/modules/event/domain/goLiveChecks.js';
import {
  evaluateGoLiveReadiness,
  toGoLiveChecks,
  type ReadinessContext,
} from '../../src/modules/event/domain/readiness/index.js';
import { CONTEXT, COVERAGE, EVIDENCE, NOW, envelope } from './eventReadinessFixtures.js';

const evaluate = (code: GoLiveCheckCode, facts: unknown, context: ReadinessContext = CONTEXT) =>
  evaluateGoLiveReadiness(context, {
    ...EVIDENCE,
    [code]: envelope(facts),
  }).find((item) => item.code === code);

describe('exact-target infrastructure readiness evidence', () => {
  const withoutCloud: ReadinessContext = {
    ...CONTEXT,
    freshness: null,
    deploymentId: null,
    databaseId: null,
    requiredAlarmIds: [],
  };

  it.each(['shift-coverage', 'categories', 'card-batch', 'gift-stock', 'attendance'] as const)(
    'evaluates local %s without any cloud configuration',
    (code) => {
      expect(evaluate(code, EVIDENCE[code].facts, withoutCloud)).toMatchObject({
        state: 'passed',
        passed: true,
        reasons: [],
      });
    },
  );

  it.each([
    ['shift-coverage', { ...COVERAGE, assignments: [] }],
    ['categories', { activeCategories: 0 }],
    ['card-batch', { batches: [] }],
    [
      'gift-stock',
      {
        gifts: [
          { ...EVIDENCE['gift-stock'].facts.gifts[0], initialStock: 0, adjustment: 0, redeemed: 0 },
        ],
      },
    ],
    ['attendance', { root: null, validatedTrustedNetworks: 1 }],
  ] as const)('preserves a known local %s failure without cloud configuration', (code, facts) => {
    expect(evaluate(code, facts, withoutCloud)).toMatchObject({ state: 'failed', passed: false });
  });

  it.each(['staging-smoke', 'backups', 'alarms'] as const)(
    'refuses %s without configured freshness bounds even for current target evidence',
    (code) => {
      expect(evaluate(code, EVIDENCE[code].facts, { ...CONTEXT, freshness: null })).toMatchObject({
        state: 'unavailable',
        passed: false,
        reasons: ['freshness-unavailable'],
      });
    },
  );

  it('does not allow written overrides to supply absent cloud freshness configuration', () => {
    const codes = ['staging-smoke', 'backups', 'alarms'] as const;
    const blockers = goLiveCheckBlockers(
      toGoLiveChecks(evaluateGoLiveReadiness(withoutCloud, EVIDENCE)),
      {
        platformAdmin: true,
        goLiveOverrides: codes.map((code) => ({ code, reason: 'Reviewed the available evidence' })),
      },
    );
    for (const code of codes) {
      expect(blockers).toContain(`go-live:${code}:missing`);
      expect(blockers).toContain(`go-live:${code}:not-failing`);
    }
  });

  it.each(['staging-smoke', 'backups', 'alarms'] as const)(
    'accepts the %s freshness boundary and refuses stale/future observations',
    (code) => {
      const facts = EVIDENCE[code].facts;
      const boundary = { ...facts, observedAtMs: NOW - 60_000 };
      if ('restorableThroughMs' in boundary) boundary.restorableThroughMs = boundary.observedAtMs;
      expect(evaluate(code, boundary)?.state).toBe('passed');
      expect(evaluate(code, { ...facts, observedAtMs: NOW - 60_001 })).toMatchObject({
        state: 'unavailable',
        reasons: ['evidence-stale'],
      });
      expect(evaluate(code, { ...facts, observedAtMs: NOW + 1 })).toMatchObject({
        state: 'unavailable',
        reasons: ['evidence-future'],
      });
    },
  );

  it.each(['staging-smoke', 'alarms'] as const)(
    'requires the selected deployment for %s',
    (code) => {
      expect(
        evaluate(code, { ...EVIDENCE[code].facts, deploymentId: 'old-release' }),
      ).toMatchObject({ state: 'unavailable', reasons: ['evidence-deployment-mismatch'] });
      expect(evaluate(code, EVIDENCE[code].facts, { ...CONTEXT, deploymentId: null })?.state).toBe(
        'unavailable',
      );
    },
  );

  it('requires the selected database for backups', () => {
    expect(
      evaluate('backups', { ...EVIDENCE.backups.facts, databaseId: 'other-database' }),
    ).toMatchObject({ state: 'unavailable', reasons: ['evidence-database-mismatch'] });
    expect(
      evaluate('backups', EVIDENCE.backups.facts, { ...CONTEXT, databaseId: null })?.state,
    ).toBe('unavailable');
  });

  it('marks a known failing current staging smoke as failed', () => {
    expect(
      evaluate('staging-smoke', { ...EVIDENCE['staging-smoke'].facts, passed: false }),
    ).toMatchObject({ state: 'failed', reasons: ['staging-smoke-failed'] });
  });

  it('requires a fresh restorable horizon without claiming a restore rehearsal', () => {
    expect(
      evaluate('backups', { ...EVIDENCE.backups.facts, restorableThroughMs: NOW - 60_000 })?.state,
    ).toBe('passed');
    expect(
      evaluate('backups', { ...EVIDENCE.backups.facts, restorableThroughMs: NOW - 60_001 }),
    ).toMatchObject({ state: 'failed', reasons: ['backups-not-fresh'] });
    expect(
      evaluate('backups', { ...EVIDENCE.backups.facts, restorableThroughMs: null }),
    ).toMatchObject({ state: 'failed', reasons: ['backup-horizon-missing'] });
    expect(
      evaluate('backups', { ...EVIDENCE.backups.facts, restorableThroughMs: NOW })?.state,
    ).toBe('unavailable');
  });

  it('requires every expected alarm to have current sufficient data', () => {
    const facts = EVIDENCE.alarms.facts;
    expect(evaluate('alarms', { ...facts, alarms: facts.alarms.slice(1) })).toMatchObject({
      state: 'unavailable',
      reasons: ['alarm-evidence-incomplete'],
    });
    expect(
      evaluate('alarms', {
        ...facts,
        alarms: facts.alarms.map((alarm) => ({ ...alarm, state: 'INSUFFICIENT_DATA' })),
      })?.state,
    ).toBe('unavailable');
    expect(
      evaluate('alarms', { ...facts, alarms: [...facts.alarms, facts.alarms[0]] }),
    ).toMatchObject({ state: 'unavailable', reasons: ['alarm-evidence-duplicate'] });
    expect(evaluate('alarms', facts, { ...CONTEXT, requiredAlarmIds: [] })).toMatchObject({
      state: 'unavailable',
      reasons: ['alarm-requirements-unavailable'],
    });
  });

  it('fails a current alarm, while ignoring unrelated additional alarms', () => {
    const facts = EVIDENCE.alarms.facts;
    expect(
      evaluate('alarms', {
        ...facts,
        alarms: facts.alarms.map((alarm) => ({ ...alarm, state: 'ALARM' })),
      }),
    ).toMatchObject({ state: 'failed', reasons: ['alarms-not-ok'] });
    expect(
      evaluate('alarms', {
        ...facts,
        alarms: [...facts.alarms, { id: 'unrelated', state: 'ALARM' }],
      })?.state,
    ).toBe('passed');
  });

  it('prevents an administrator reason from waiving stale or wrong-release evidence', () => {
    const evidence = {
      ...EVIDENCE,
      'staging-smoke': envelope({
        ...EVIDENCE['staging-smoke'].facts,
        deploymentId: 'old-release',
      }),
    };
    const blockers = goLiveCheckBlockers(
      toGoLiveChecks(evaluateGoLiveReadiness(CONTEXT, evidence)),
      {
        platformAdmin: true,
        goLiveOverrides: [
          { code: 'staging-smoke', reason: 'A reason cannot create source evidence' },
        ],
      },
    );
    expect(blockers).toEqual([
      'go-live:staging-smoke:not-failing',
      'go-live:staging-smoke:missing',
    ]);
  });
});
