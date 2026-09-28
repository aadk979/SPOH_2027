import type { ImportIssue } from '@spoh/shared';

/**
 * Reconciliation imports as a plan: which rows would be written, which are
 * already in (a re-run after a partial failure), and which cannot be placed.
 * A preview is the plan alone; a commit applies it. Pure, so the same rules
 * decide both, with no rolled-back transaction standing in for a preview.
 */

/** One record an import would write, keyed so a re-run writes it once. */
export interface KeyedRecord<T> {
  key: string;
  record: T;
}

export interface ImportPlan<T> {
  creates: KeyedRecord<T>[];
  skipped: number;
  issues: ImportIssue[];
}

/**
 * Plan an import. Each row either names an unknown station (an issue; nothing
 * guessed) or expands into keyed records, of which those already stored are
 * skipped.
 */
export function planImport<Row extends { stationCode: string }, T>(
  rows: readonly Row[],
  snapshot: { stationIds: ReadonlyMap<string, string>; existingKeys: ReadonlySet<string> },
  expand: (row: Row, context: { rowNumber: number; stationId: string }) => KeyedRecord<T>[],
): ImportPlan<T> {
  const plan: ImportPlan<T> = { creates: [], skipped: 0, issues: [] };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const stationId = snapshot.stationIds.get(row.stationCode.toUpperCase());
    if (!stationId) {
      plan.issues.push({
        rowNumber,
        field: 'stationCode',
        message: `Unknown station code ${row.stationCode}`,
      });
      return;
    }
    for (const keyed of expand(row, { rowNumber, stationId })) {
      if (snapshot.existingKeys.has(keyed.key)) plan.skipped += 1;
      else plan.creates.push(keyed);
    }
  });

  return plan;
}
