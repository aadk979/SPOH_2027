import { z } from 'zod';
import { ReadinessContext, type ReadinessEvidence } from '../domain/readiness/index.js';

const CloudSnapshot = z.object({
  selection: ReadinessContext.omit({ eventId: true, evaluatedAtMs: true }),
  smoke: z.unknown().optional(), backups: z.unknown().optional(), alarms: z.unknown().optional(),
}).strict();

/** Only prepared server observations enter here; every fact retains the domain's strict refusal checks. */
export function cloudReadinessEvidence(value: unknown, eventId: string) {
  const cloud = CloudSnapshot.safeParse(value);
  if (!cloud.success) return { selection: null, evidence: {} };
  const facts = cloud.data;
  const evidence: ReadinessEvidence = {
    ...(facts.smoke === undefined ? {} : { 'staging-smoke': { eventId, facts: facts.smoke } }),
    ...(facts.backups === undefined ? {} : { backups: { eventId, facts: facts.backups } }),
    ...(facts.alarms === undefined ? {} : { alarms: { eventId, facts: facts.alarms } }),
  };
  return { selection: facts.selection, evidence };
}
