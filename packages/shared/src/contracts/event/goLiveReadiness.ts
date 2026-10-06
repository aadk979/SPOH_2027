import { z } from 'zod';

/** Server-owned go-live checks; a reason acknowledges one failing item only. */
export const GoLiveCheckCode = z.enum([
  'shift-coverage',
  'categories',
  'card-batch',
  'gift-stock',
  'content',
  'attendance',
  'role-permissions',
  'notifications',
  'staging-smoke',
  'backups',
  'alarms',
]);
export type GoLiveCheckCode = z.infer<typeof GoLiveCheckCode>;

/** Fixed evaluator messages cannot expose private evidence, identities or configuration. */
export const GoLiveReadinessReasonCode = z.enum([
  'evidence-unavailable',
  'evidence-malformed',
  'evidence-scope-mismatch',
  'evaluation-context-unavailable',
  'evidence-future',
  'evidence-stale',
  'freshness-unavailable',
  'evidence-deployment-mismatch',
  'evidence-database-mismatch',
  'alarm-requirements-unavailable',
  'alarm-evidence-duplicate',
  'alarm-evidence-incomplete',
  'coverage-structure-empty',
  'shifts-not-materialised',
  'shift-station-unstaffed',
  'categories-empty',
  'live-card-batch-missing',
  'gift-types-empty',
  'live-gift-stock-empty',
  'content-unpublished',
  'attendance-root-invalid',
  'attendance-networks-empty',
  'role-permissions-unreviewed',
  'notifications-unconfigured',
  'staging-smoke-failed',
  'backup-horizon-missing',
  'backups-not-fresh',
  'alarms-not-ok',
]);
export type GoLiveReadinessReasonCode = z.infer<typeof GoLiveReadinessReasonCode>;

export const GoLiveReadinessItem = z
  .object({
    code: GoLiveCheckCode,
    state: z.enum(['passed', 'failed', 'unavailable']),
    passed: z.boolean(),
    reasons: z
      .array(GoLiveReadinessReasonCode)
      .max(GoLiveReadinessReasonCode.options.length)
      .refine((reasons) => new Set(reasons).size === reasons.length),
  })
  .strict()
  .refine((item) =>
    item.state === 'passed'
      ? item.passed && item.reasons.length === 0
      : !item.passed && item.reasons.length > 0,
  );
export type GoLiveReadinessItem = z.infer<typeof GoLiveReadinessItem>;

/** Exact, unique enum membership requires every item; partial public evidence is invalid. */
export const GoLiveReadinessChecklist = z
  .array(GoLiveReadinessItem)
  .length(GoLiveCheckCode.options.length)
  .refine((items) => new Set(items.map((item) => item.code)).size === items.length);
export type GoLiveReadinessChecklist = z.infer<typeof GoLiveReadinessChecklist>;
