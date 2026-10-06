import { describe, expect, it } from 'vitest';
import { evaluateGoLiveReadiness } from '../../src/modules/event/domain/readiness/index.js';
import { CONTEXT, COVERAGE, EVIDENCE, envelope } from './eventReadinessFixtures.js';

const evaluate = (facts: unknown) =>
  evaluateGoLiveReadiness(CONTEXT, {
    ...EVIDENCE,
    'shift-coverage': envelope(facts),
  }).find((item) => item.code === 'shift-coverage');

describe('every materialised shift and active station requires eligible staffing', () => {
  it('checks the full days × templates × stations grid', () => {
    expect(evaluate(COVERAGE)?.state).toBe('passed');
    expect(evaluate({ ...COVERAGE, assignments: COVERAGE.assignments.slice(1) })).toMatchObject({
      state: 'failed',
      reasons: ['shift-station-unstaffed'],
    });
    expect(evaluate({ ...COVERAGE, shifts: COVERAGE.shifts.slice(1) })).toMatchObject({
      state: 'failed',
      reasons: ['shifts-not-materialised'],
    });
  });

  it.each(['dayIds', 'templateIds', 'stationIds'])(
    'does not pass an empty %s grid vacuously',
    (key) => {
      expect(evaluate({ ...COVERAGE, [key]: [], shifts: [], assignments: [] })).toMatchObject({
        state: 'failed',
        reasons: ['coverage-structure-empty'],
      });
    },
  );

  it.each(['INVITED', 'DEACTIVATED', 'ENDED'])(
    'ignores a membership whose current status is %s',
    (status) => {
      expect(
        evaluate({
          ...COVERAGE,
          memberships: COVERAGE.memberships.map((member) => ({ ...member, status })),
        })?.state,
      ).toBe('failed');
    },
  );

  it('rejects invented independent Person active fields instead of treating them as evidence', () => {
    expect(
      evaluate({
        ...COVERAGE,
        memberships: COVERAGE.memberships.map((member) => ({ ...member, personActive: false })),
      })?.state,
    ).toBe('unavailable');
  });

  it.each([
    { ...COVERAGE.assignments[0], membershipId: null },
    { ...COVERAGE.assignments[0], membershipId: 'unknown-member' },
    { ...COVERAGE.assignments[0], personId: 'person-b' },
    { ...COVERAGE.assignments[0], dayId: 'day-b' },
    { ...COVERAGE.assignments[0], shiftId: 'unknown-shift' },
    { ...COVERAGE.assignments[0], stationId: 'unknown-station' },
  ])('does not count an unrelated, stale or unresolved assignment', (assignment) => {
    expect(
      evaluate({ ...COVERAGE, assignments: [assignment, ...COVERAGE.assignments.slice(1)] })?.state,
    ).toBe('failed');
  });

  it.each([
    { ...COVERAGE, dayIds: ['day-a', 'day-a', 'day-b'] },
    { ...COVERAGE, stationIds: ['station-a', 'station-a'] },
    { ...COVERAGE, shifts: [...COVERAGE.shifts, COVERAGE.shifts[0]] },
    {
      ...COVERAGE,
      shifts: [{ ...COVERAGE.shifts[0], dayId: 'foreign-day' }, ...COVERAGE.shifts.slice(1)],
    },
    { ...COVERAGE, memberships: [...COVERAGE.memberships, COVERAGE.memberships[0]] },
  ])('rejects ambiguous or incoherent snapshot identities as unavailable', (facts) => {
    expect(evaluate(facts)).toMatchObject({
      state: 'unavailable',
      reasons: ['evidence-malformed'],
    });
  });
});
