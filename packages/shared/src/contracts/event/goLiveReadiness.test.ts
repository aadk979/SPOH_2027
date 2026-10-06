import { expect, it } from 'vitest';
import { LifecycleReadinessResponse } from './index.js';
import {
  GoLiveCheckCode,
  GoLiveReadinessChecklist,
  GoLiveReadinessItem,
} from './goLiveReadiness.js';

const items = () =>
  GoLiveCheckCode.options.map((code) => ({
    code,
    state: 'unavailable' as const,
    passed: false,
    reasons: ['evidence-unavailable' as const],
  }));

it('requires every unique checklist code with a consistent fixed public decision', () => {
  expect(GoLiveReadinessChecklist.parse(items())).toHaveLength(11);
  for (const malformed of [
    [],
    items().slice(1),
    [...items(), items()[0]],
    items().map(() => items()[0]),
  ])
    expect(GoLiveReadinessChecklist.safeParse(malformed).success).toBe(false);
  expect(
    GoLiveReadinessItem.parse({ code: 'categories', state: 'passed', passed: true, reasons: [] }),
  ).toEqual({
    code: 'categories',
    state: 'passed',
    passed: true,
    reasons: [],
  });
  expect(
    GoLiveReadinessItem.parse({
      code: 'categories',
      state: 'failed',
      passed: false,
      reasons: ['categories-empty'],
    }).state,
  ).toBe('failed');
});

it.each([
  { state: 'passed', passed: false, reasons: [] },
  { state: 'passed', passed: true, reasons: ['categories-empty'] },
  { state: 'failed', passed: true, reasons: ['categories-empty'] },
  { state: 'failed', passed: false, reasons: [] },
  { state: 'unavailable', passed: true, reasons: ['evidence-unavailable'] },
  { state: 'unavailable', passed: false, reasons: [] },
  { state: 'unknown', passed: false, reasons: ['evidence-unavailable'] },
  { state: 'failed', passed: false, reasons: ['private-root-id'] },
  { state: 'failed', passed: false, reasons: ['categories-empty', 'categories-empty'] },
])('rejects incoherent or private decision fields: %j', (decision) => {
  expect(GoLiveReadinessItem.safeParse({ code: 'categories', ...decision }).success).toBe(false);
});

it('rejects unexpected private evidence and requires checklist data on the advisory response', () => {
  const item = items()[0]!;
  for (const extra of [
    { evidence: { personId: 'private' } },
    { eventId: 'private' },
    { raw: 'private' },
  ])
    expect(GoLiveReadinessItem.safeParse({ ...item, ...extra }).success).toBe(false);
  const response = {
    lifecycle: { eventId: 'event', status: 'READY', version: 1, hasBeenLive: false },
    evaluatedAt: '2026-10-06T00:00:00Z',
    reopenUntil: null,
    transitions: [],
  };
  expect(LifecycleReadinessResponse.safeParse(response).success).toBe(false);
  expect(
    LifecycleReadinessResponse.parse({ ...response, goLiveReadiness: items() }).goLiveReadiness,
  ).toEqual(items());
  expect(
    LifecycleReadinessResponse.safeParse({
      ...response,
      goLiveReadiness: items(),
      rootMembershipId: 'private',
    }).success,
  ).toBe(false);
});
