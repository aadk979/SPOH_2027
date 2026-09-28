import { createHash } from 'node:crypto';

/**
 * A stable idempotency key for an imported row.
 *
 * Derived from the content rather than generated, so re-running the same import
 * after a partial failure creates nothing new. Reconciliation happens under
 * time pressure with a named owner, and "run it again" has to be safe.
 *
 * The row number is part of the key (F03-012). Two volunteers' sheets for the
 * same desk, category and half hour are two rows with the same content, and
 * both are real: keyed by content alone, the second was "skipped" as a
 * duplicate of the first and its tally disappeared.
 */
export function importKey(source: string, batchScope: string, parts: readonly unknown[]): string {
  const digest = createHash('sha256')
    .update([source, batchScope, ...parts.map(String)].join('|'))
    .digest('hex')
    .slice(0, 40);

  return `import:${digest}`;
}
