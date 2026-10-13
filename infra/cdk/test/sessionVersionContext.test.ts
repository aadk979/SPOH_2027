import { expect, it } from 'vitest';
// @ts-expect-error Operator selector validator is import-safe authored ESM.
import { sessionVersionContext } from '../../scripts/session-version-context.mjs';

const old = '11111111-1111-4111-8111-111111111111';
const next = '22222222-2222-4222-8222-222222222222';
it('retains deployed overlap on a routine release and enforces preload then flip then retirement', () => {
  expect(sessionVersionContext({ priorCurrent: old, priorPrevious: next })).toEqual({ staging: { current: old, previous: next } });
  expect(sessionVersionContext({ priorCurrent: old, current: old, previous: next, phase: 'preload' })).toEqual({ staging: { current: old, previous: next } });
  expect(sessionVersionContext({ priorCurrent: old, priorPrevious: next, current: next, previous: old, phase: 'flip' })).toEqual({ staging: { current: next, previous: old } });
  expect(sessionVersionContext({ priorCurrent: next, priorPrevious: old, phase: 'retire' })).toEqual({ staging: { current: next } });
});
it('refuses a skipped preload, dropped overlap or ambiguous invalid/equal versions', () => {
  expect(() => sessionVersionContext({ priorCurrent: old, current: next })).toThrow('Routine release');
  expect(() => sessionVersionContext({ priorCurrent: old, current: next, previous: old, phase: 'flip' })).toThrow('deployed preload');
  expect(() => sessionVersionContext({ current: old, previous: old })).toThrow('Distinct valid');
  expect(() => sessionVersionContext({ current: 'AWSCURRENT' })).toThrow('Explicit current');
});
