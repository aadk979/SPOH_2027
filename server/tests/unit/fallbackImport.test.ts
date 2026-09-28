import { describe, expect, it } from 'vitest';
import { planImport } from '../../src/modules/fallback/domain/importPlan.js';
import {
  assertEndsAfterStart,
  assertNoOpenWindow,
  assertWindowOpen,
} from '../../src/modules/fallback/domain/windowRules.js';

/** Fallback rules and the import plan (P06.8), without a database. */

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('import plan', () => {
  const rows = [
    { stationCode: 'desk', count: 2 },
    { stationCode: 'NOWHERE', count: 1 },
  ];
  const expand = (row: { count: number }, context: { rowNumber: number; stationId: string }) =>
    Array.from({ length: row.count }, (_, n) => ({
      key: `${context.rowNumber}:${n}`,
      record: { stationId: context.stationId },
    }));
  const stationIds = new Map([['DESK', 'station-desk']]);

  it('expands rows, matching station codes case-insensitively, and reports unknown ones', () => {
    const plan = planImport(rows, { stationIds, existingKeys: new Set() }, expand);
    expect(plan.creates.map((keyed) => keyed.key)).toEqual(['1:0', '1:1']);
    expect(plan.creates[0]?.record.stationId).toBe('station-desk');
    expect(plan.issues).toEqual([
      { rowNumber: 2, field: 'stationCode', message: 'Unknown station code NOWHERE' },
    ]);
  });

  it('skips records a previous run already wrote', () => {
    const plan = planImport(rows, { stationIds, existingKeys: new Set(['1:0']) }, expand);
    expect(plan.creates.map((keyed) => keyed.key)).toEqual(['1:1']);
    expect(plan.skipped).toBe(1);
  });
});

describe('fallback window rules', () => {
  it('allows one open window per scope, closes once, and never before it started', () => {
    expect(codeOf(() => assertNoOpenWindow({ id: 'w' }, null))).toBe('FALLBACK_ALREADY_OPEN');
    expect(codeOf(() => assertNoOpenWindow(null, null))).toBeUndefined();
    expect(codeOf(() => assertWindowOpen({ endedAt: new Date() }))).toBe('FALLBACK_ALREADY_CLOSED');
    const window = { startedAt: new Date('2027-01-07T03:00:00.000Z') };
    expect(codeOf(() => assertEndsAfterStart(window, new Date('2027-01-07T02:00:00.000Z')))).toBe(
      'VALIDATION_FAILED',
    );
  });
});
