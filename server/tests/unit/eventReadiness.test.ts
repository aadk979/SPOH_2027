import { describe, expect, it } from 'vitest';
import { GoLiveCheckCode } from '@spoh/shared';
import { goLiveCheckBlockers } from '../../src/modules/event/domain/goLiveChecks.js';
import {
  evaluateGoLiveReadiness,
  toGoLiveChecks,
  type ReadinessEvidence,
  type ReadinessItem,
} from '../../src/modules/event/domain/readiness/index.js';
import { CONTEXT, EVIDENCE, envelope } from './eventReadinessFixtures.js';

function item(code: GoLiveCheckCode, evidence: ReadinessEvidence = EVIDENCE) {
  return evaluateGoLiveReadiness(CONTEXT, evidence).find((result) => result.code === code);
}

describe('server-owned go-live readiness contract', () => {
  it('produces each shared catalogue item once and supplies the existing lifecycle guard', () => {
    const items = evaluateGoLiveReadiness(CONTEXT, EVIDENCE);
    expect(items.map((result) => result.code)).toEqual(GoLiveCheckCode.options);
    expect(
      items.every((result) => result.state === 'passed' && result.passed && !result.reasons.length),
    ).toBe(true);
    expect(goLiveCheckBlockers(toGoLiveChecks(items), { platformAdmin: false })).toEqual([]);
  });

  it.each(GoLiveCheckCode.options)(
    'keeps missing %s evidence outside the overrideable checks',
    (code) => {
      const evidence = { ...EVIDENCE, [code]: undefined };
      expect(item(code, evidence)).toMatchObject({
        state: 'unavailable',
        passed: false,
        reasons: ['evidence-unavailable'],
      });
      const blockers = goLiveCheckBlockers(
        toGoLiveChecks(evaluateGoLiveReadiness(CONTEXT, evidence)),
        {
          platformAdmin: true,
          goLiveOverrides: [{ code, reason: 'Reviewed the current item with the event owner' }],
        },
      );
      expect(blockers).toContain(`go-live:${code}:missing`);
      expect(blockers).toContain(`go-live:${code}:not-failing`);
    },
  );

  it.each(GoLiveCheckCode.options)(
    'refuses foreign, client-forged and malformed %s snapshots',
    (code) => {
      expect(
        item(code, { ...EVIDENCE, [code]: { ...EVIDENCE[code], eventId: 'event-b' } }),
      ).toMatchObject({
        state: 'unavailable',
        reasons: ['evidence-scope-mismatch'],
      });
      expect(
        item(code, { ...EVIDENCE, [code]: { ...EVIDENCE[code], passed: true } }),
      ).toMatchObject({
        state: 'unavailable',
        reasons: ['evidence-malformed'],
      });
      expect(item(code, { ...EVIDENCE, [code]: envelope({}) })).toMatchObject({
        state: 'unavailable',
        reasons: ['evidence-malformed'],
      });
    },
  );

  it.each([
    { ...CONTEXT, eventId: '' },
    { ...CONTEXT, evaluatedAtMs: NaN },
    { ...CONTEXT, freshness: { ...CONTEXT.freshness, smokeMaxAgeMs: 0 } },
    { ...CONTEXT, platformAdmin: true },
  ])('fails closed for invalid evaluation context', (context) => {
    const items = evaluateGoLiveReadiness(context, EVIDENCE);
    expect(items.every((result) => result.state === 'unavailable')).toBe(true);
    expect(toGoLiveChecks(items)).toEqual([]);
  });

  it('allows only actual failed items to use the existing current-authority override path', () => {
    const evidence = { ...EVIDENCE, categories: envelope({ activeCategories: 0 }) };
    const checks = toGoLiveChecks(evaluateGoLiveReadiness(CONTEXT, evidence));
    expect(goLiveCheckBlockers(checks, { platformAdmin: false })).toEqual(['go-live:categories']);
    expect(
      goLiveCheckBlockers(checks, {
        platformAdmin: true,
        goLiveOverrides: [{ code: 'categories', reason: 'Reviewed this known category failure' }],
      }),
    ).toEqual([]);
  });

  it('is deterministic and does not expose evidence identifiers, messages, reasons or credentials', () => {
    const saved = JSON.stringify(EVIDENCE);
    const first = evaluateGoLiveReadiness(CONTEXT, EVIDENCE);
    expect(evaluateGoLiveReadiness(CONTEXT, EVIDENCE)).toEqual(first);
    expect(JSON.stringify(EVIDENCE)).toBe(saved);
    expect(JSON.stringify(first)).not.toMatch(
      /event-a|member-a|alarm-api|live-batch|accepted-release/,
    );
  });

  it.each([
    { code: 'categories', state: 'failed', passed: true, reasons: ['categories-empty'] },
    { code: 'categories', state: 'passed', passed: false, reasons: [] },
    { code: 'categories', state: 'passed', passed: true, reasons: ['categories-empty'] },
    { code: 'categories', state: 'failed', passed: false, reasons: [] },
    { code: 'categories', state: 'unknown', passed: true, reasons: [] },
    { code: 'unknown', state: 'passed', passed: true, reasons: [] },
    { code: 'categories', state: 'passed', passed: 'true', reasons: [] },
    { code: 'categories', state: 'failed', passed: 0, reasons: ['categories-empty'] },
    { code: 'categories', state: 'failed', passed: false, reasons: [''] },
    { code: 'categories', state: 'failed', passed: false, reasons: [1] },
  ])('does not translate an incoherent item into lifecycle permission', (incoherent) => {
    expect(toGoLiveChecks([incoherent as unknown as ReadinessItem])).toEqual([]);
  });

  it('omits both ambiguous duplicate results regardless of their order', () => {
    const passed: ReadinessItem = {
      code: 'categories',
      state: 'passed',
      passed: true,
      reasons: [],
    };
    const failed: ReadinessItem = {
      code: 'categories',
      state: 'failed',
      passed: false,
      reasons: ['categories-empty'],
    };
    expect(toGoLiveChecks([passed, failed])).toEqual([]);
    expect(toGoLiveChecks([failed, passed])).toEqual([]);
    const checks = toGoLiveChecks([...evaluateGoLiveReadiness(CONTEXT, EVIDENCE), failed]);
    expect(goLiveCheckBlockers(checks, { platformAdmin: false })).toEqual([
      'go-live:categories:missing',
    ]);
  });
});
