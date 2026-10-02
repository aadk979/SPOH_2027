import { GoLiveCheckCode, type GoLiveOverride } from '@spoh/shared';

export const GO_LIVE_CHECKS = GoLiveCheckCode.options;
export type GoLiveCheck = { code: GoLiveCheckCode; passed: boolean };
export interface GoLiveContext {
  platformAdmin: boolean;
  goLiveOverrides?: readonly GoLiveOverride[];
}

function overrideBlockers(checks: Map<GoLiveCheckCode, boolean>, context: GoLiveContext) {
  const overrides = context.goLiveOverrides ?? [];
  if (!overrides.length) return [];
  const blockers = context.platformAdmin ? [] : ['platform-admin-required'];
  const seen = new Set<GoLiveCheckCode>();
  for (const item of overrides) {
    if (seen.has(item.code)) blockers.push(`go-live:${item.code}:duplicate-override`);
    seen.add(item.code);
    if (!item.reason.trim()) blockers.push(`go-live:${item.code}:reason-required`);
    if (checks.get(item.code) !== false) blockers.push(`go-live:${item.code}:not-failing`);
  }
  return blockers;
}

/** Authority and a per-item reason may acknowledge failure, never absent server evidence. */
export function goLiveCheckBlockers(checklist: readonly GoLiveCheck[], context: GoLiveContext) {
  if (!checklist.length) return ['go-live-checklist-unavailable'];
  const checks = new Map(checklist.map((check) => [check.code, check.passed]));
  const blockers = overrideBlockers(checks, context);
  const overrides = new Map(context.goLiveOverrides?.map((item) => [item.code, item.reason]));
  for (const code of GO_LIVE_CHECKS) {
    if (!checks.has(code)) blockers.push(`go-live:${code}:missing`);
    else if (!checks.get(code) && !(context.platformAdmin && overrides.get(code)?.trim())) {
      blockers.push(`go-live:${code}`);
    }
  }
  return blockers;
}
