import { expect, it } from 'vitest';
import { GoLiveCheckCode } from '@spoh/shared';
import { publicGoLiveReadiness } from '../../src/modules/event/application/publicGoLiveReadiness.js';
import type { ReadinessItem } from '../../src/modules/event/domain/readiness/index.js';

const items = (): ReadinessItem[] =>
  GoLiveCheckCode.options.map((code) => ({
    code,
    state: 'unavailable',
    passed: false,
    reasons: ['evidence-unavailable'],
  }));

it('explicitly projects the exact checklist and discards private internal properties', () => {
  const internal = items().map((item) => ({
    ...item,
    eventId: 'private-event',
    evidence: { memberId: 'private-member', cidr: '203.0.113.0/24' },
  }));
  const result = publicGoLiveReadiness(internal);
  expect(result).toEqual(items());
  expect(JSON.stringify(result)).not.toMatch(/private|203\.0\.113/);
  expect(result[0]!.reasons).not.toBe(internal[0]!.reasons);
});

it('fails closed on missing codes, duplicate codes and uncontrolled reason text', () => {
  expect(() => publicGoLiveReadiness(items().slice(1))).toThrow();
  expect(() => publicGoLiveReadiness(items().map(() => items()[0]!))).toThrow();
  const uncontrolled = items();
  uncontrolled[0]!.reasons = ['private SQL or provider error'];
  expect(() => publicGoLiveReadiness(uncontrolled)).toThrow();
});
