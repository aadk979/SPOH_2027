import { z } from 'zod';
import {
  fromFailures,
  itemEvaluator,
  observationRefusal,
  ReadinessId,
  ReadinessInstant,
  unavailable,
} from './contract.js';

export const StagingSmokeFacts = z
  .object({ deploymentId: ReadinessId, observedAtMs: ReadinessInstant, passed: z.boolean() })
  .strict();
export const evaluateStagingSmoke = itemEvaluator(
  'staging-smoke',
  StagingSmokeFacts,
  (facts, context) => {
    if (!context.freshness) return unavailable('freshness-unavailable');
    if (!context.deploymentId || facts.deploymentId !== context.deploymentId) {
      return unavailable('evidence-deployment-mismatch');
    }
    return (
      observationRefusal(facts.observedAtMs, context, context.freshness.smokeMaxAgeMs) ??
      fromFailures(facts.passed ? [] : ['staging-smoke-failed'])
    );
  },
);

/** RDS's restorable horizon proves freshness for the selected database, not a restore rehearsal. */
export const BackupFacts = z
  .object({
    databaseId: ReadinessId,
    observedAtMs: ReadinessInstant,
    restorableThroughMs: ReadinessInstant.nullable(),
  })
  .strict();
export const evaluateBackups = itemEvaluator('backups', BackupFacts, (facts, context) => {
  if (!context.freshness) return unavailable('freshness-unavailable');
  if (!context.databaseId || facts.databaseId !== context.databaseId)
    return unavailable('evidence-database-mismatch');
  const refusal = observationRefusal(facts.observedAtMs, context, context.freshness.backupMaxAgeMs);
  if (refusal) return refusal;
  if (facts.restorableThroughMs === null) return fromFailures(['backup-horizon-missing']);
  if (facts.restorableThroughMs > facts.observedAtMs) return unavailable('evidence-future');
  return fromFailures(
    context.evaluatedAtMs - facts.restorableThroughMs <= context.freshness.backupMaxAgeMs
      ? []
      : ['backups-not-fresh'],
  );
});

export const AlarmFacts = z
  .object({
    deploymentId: ReadinessId,
    observedAtMs: ReadinessInstant,
    alarms: z.array(
      z.object({ id: ReadinessId, state: z.enum(['OK', 'ALARM', 'INSUFFICIENT_DATA']) }).strict(),
    ),
  })
  .strict();
export const evaluateAlarms = itemEvaluator('alarms', AlarmFacts, (facts, context) => {
  if (!context.freshness) return unavailable('freshness-unavailable');
  if (!context.deploymentId || facts.deploymentId !== context.deploymentId)
    return unavailable('evidence-deployment-mismatch');
  const refusal = observationRefusal(facts.observedAtMs, context, context.freshness.alarmsMaxAgeMs);
  if (refusal) return refusal;
  if (!context.requiredAlarmIds.length) return unavailable('alarm-requirements-unavailable');
  const states = new Map(facts.alarms.map((alarm) => [alarm.id, alarm.state]));
  if (states.size !== facts.alarms.length) return unavailable('alarm-evidence-duplicate');
  if (
    context.requiredAlarmIds.some((id) => !states.has(id) || states.get(id) === 'INSUFFICIENT_DATA')
  ) {
    return unavailable('alarm-evidence-incomplete');
  }
  return fromFailures(
    context.requiredAlarmIds.every((id) => states.get(id) === 'OK') ? [] : ['alarms-not-ok'],
  );
});
