import { GoLiveReadinessChecklist } from '@spoh/shared';
import type { ReadinessItem } from '../domain/readiness/index.js';

/** Pick public fields explicitly and fail closed if the fixed evaluator contract drifts. */
export function publicGoLiveReadiness(items: readonly ReadinessItem[]): GoLiveReadinessChecklist {
  return GoLiveReadinessChecklist.parse(
    items.map((item) => ({
      code: item.code,
      state: item.state,
      passed: item.passed,
      reasons: [...item.reasons],
    })),
  );
}
