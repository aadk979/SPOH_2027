import type { GoLiveCheckCode } from '@spoh/shared';
import { z } from 'zod';

export const ReadinessId = z.string().trim().min(1).max(200);
export const ReadinessCount = z.number().int().nonnegative();
export const ReadinessInstant = z.number().int().nonnegative();

/** Infrastructure identities and freshness bounds come from server configuration. */
export const ReadinessContext = z
  .object({
    eventId: ReadinessId,
    evaluatedAtMs: ReadinessInstant,
    deploymentId: ReadinessId.nullable(),
    databaseId: ReadinessId.nullable(),
    requiredAlarmIds: z.array(ReadinessId),
    freshness: z
      .object({
        smokeMaxAgeMs: z.number().int().positive(),
        backupMaxAgeMs: z.number().int().positive(),
        alarmsMaxAgeMs: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ReadinessContext = z.infer<typeof ReadinessContext>;

export type ReadinessState = 'passed' | 'failed' | 'unavailable';
export interface ReadinessItem {
  code: GoLiveCheckCode;
  state: ReadinessState;
  passed: boolean;
  reasons: readonly string[];
}
export type ItemDecision = { state: ReadinessState; reasons: readonly string[] };
export type ItemEvaluator = (evidence: unknown, context: ReadinessContext) => ReadinessItem;
export type ReadinessEvidence = Partial<Record<GoLiveCheckCode, unknown>>;

export function unavailable(reason: string): ItemDecision {
  return { state: 'unavailable', reasons: [reason] };
}

export function fromFailures(reasons: readonly string[]): ItemDecision {
  return { state: reasons.length ? 'failed' : 'passed', reasons };
}

export function toReadinessItem(code: GoLiveCheckCode, decision: ItemDecision): ReadinessItem {
  return { code, ...decision, passed: decision.state === 'passed' };
}

/** Malformed or foreign evidence cannot become an overrideable failed check. */
export function itemEvaluator<T>(
  code: GoLiveCheckCode,
  schema: z.ZodType<T>,
  evaluate: (facts: T, context: ReadinessContext) => ItemDecision,
): ItemEvaluator {
  const envelope = z.object({ eventId: ReadinessId, facts: schema }).strict();
  return (evidence, context) => {
    if (evidence === undefined || evidence === null) {
      return toReadinessItem(code, unavailable('evidence-unavailable'));
    }
    const parsed = envelope.safeParse(evidence);
    if (!parsed.success) return toReadinessItem(code, unavailable('evidence-malformed'));
    if (parsed.data.eventId !== context.eventId) {
      return toReadinessItem(code, unavailable('evidence-scope-mismatch'));
    }
    return toReadinessItem(code, evaluate(parsed.data.facts, context));
  };
}

/** Clock skew and expired observations are unavailable, so a reason cannot waive them. */
export function observationRefusal(
  observedAtMs: number,
  context: ReadinessContext,
  maxAgeMs: number,
): ItemDecision | null {
  const age = context.evaluatedAtMs - observedAtMs;
  if (age < 0) return unavailable('evidence-future');
  if (age > maxAgeMs) return unavailable('evidence-stale');
  return null;
}
