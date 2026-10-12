import type { IncidentSeverity } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { activeNoticeAudience, queueNotices } from '../../notification/index.js';
import { pushesToSafetyChain } from '../domain/safetyPush.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Notify the safety chain of a severe incident. The WhatsApp Safety
 * Communications Chat remains the human channel; this feeds it rather than
 * replacing it (PRODUCT_BRIEF §7.4).
 */
export async function notifySafetyChain(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { incident: {
    id: string;
    severity: IncidentSeverity;
    rehearsal: boolean;
  }; reporterId: string; now: Date },
): Promise<void> {
  const { incident, reporterId, now } = input;
  if (!pushesToSafetyChain(incident.severity)) return;
  await queueNotices(tx, scope, { kind: 'INCIDENT_RAISED', priority: 'URGENT',
    source: { kind: 'INCIDENT', id: incident.id }, transitionKey: `incident:${incident.id}:raised`,
    context: { type: 'incident' }, createdAt: now,
    recipientPersonIds: await activeNoticeAudience(scope, { tx,
      minimumRole: 'IC', excludePersonId: reporterId }) });
}
