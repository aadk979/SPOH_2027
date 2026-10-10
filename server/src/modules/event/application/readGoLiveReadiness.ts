import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { contentReadiness } from '../../content/index.js';
import { readinessSnapshot } from '../data/readinessSnapshotRepo.js';
import {
  evaluateGoLiveReadiness,
  toGoLiveChecks,
  type ReadinessContext,
} from '../domain/readiness/index.js';
import { localReadinessEvidence } from './localReadinessEvidence.js';

/** The caller owns Event/current-member locks and samples its injected clock after waits. */
export async function readGoLiveReadiness(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; now: Date },
) {
  const context: ReadinessContext = {
    eventId: input.scope.eventId,
    evaluatedAtMs: input.now.getTime(),
    deploymentId: null,
    databaseId: null,
    requiredAlarmIds: [],
    freshness: null,
  };
  const raw = await readinessSnapshot(tx, input.scope);
  const evidence = localReadinessEvidence(raw, input.scope.eventId);
  evidence.content = {
    eventId: input.scope.eventId,
    facts: await contentReadiness(tx, input.scope),
  };
  const items = evaluateGoLiveReadiness(context, evidence);
  return { items, checks: toGoLiveChecks(items) };
}
