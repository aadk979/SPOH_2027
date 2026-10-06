import { GoLiveCheckCode } from '@spoh/shared';
import {
  ReadinessContext,
  toReadinessItem,
  unavailable,
  type ItemEvaluator,
  type ReadinessEvidence,
  type ReadinessItem,
} from './contract.js';
import { evaluateShiftCoverage } from './coverage.js';
import { evaluateAlarms, evaluateBackups, evaluateStagingSmoke } from './external.js';
import {
  evaluateAttendance,
  evaluateCardBatch,
  evaluateCategories,
  evaluateContent,
  evaluateGiftStock,
  evaluateNotifications,
  evaluateRolePermissions,
} from './operational.js';

const EVALUATORS: Record<GoLiveCheckCode, ItemEvaluator> = {
  'shift-coverage': evaluateShiftCoverage,
  categories: evaluateCategories,
  'card-batch': evaluateCardBatch,
  'gift-stock': evaluateGiftStock,
  content: evaluateContent,
  attendance: evaluateAttendance,
  'role-permissions': evaluateRolePermissions,
  notifications: evaluateNotifications,
  'staging-smoke': evaluateStagingSmoke,
  backups: evaluateBackups,
  alarms: evaluateAlarms,
};

/** This accepts server snapshots only; there is intentionally no public request contract. */
export function evaluateGoLiveReadiness(
  context: unknown,
  evidence: ReadinessEvidence,
): ReadinessItem[] {
  const parsed = ReadinessContext.safeParse(context);
  return GoLiveCheckCode.options.map((code) =>
    parsed.success
      ? EVALUATORS[code](evidence[code], parsed.data)
      : toReadinessItem(code, unavailable('evaluation-context-unavailable')),
  );
}

/** Missing observations stay missing in P10's override guard, rather than waiverable false. */
export function toGoLiveChecks(items: readonly ReadinessItem[]) {
  const counts = new Map<GoLiveCheckCode, number>();
  for (const item of items) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  return items
    .filter((item) => counts.get(item.code) === 1 && coherentItem(item))
    .map((item) => ({ code: item.code, passed: item.state === 'passed' }));
}

function coherentItem(item: ReadinessItem): boolean {
  if (!GoLiveCheckCode.options.includes(item.code)) return false;
  if (
    !Array.isArray(item.reasons) ||
    !item.reasons.every((reason) => typeof reason === 'string' && reason.length > 0)
  ) {
    return false;
  }
  if (item.state === 'passed') return item.passed === true && item.reasons.length === 0;
  return item.state === 'failed' && item.passed === false && item.reasons.length > 0;
}
