import type { AuditContext } from '../../../platform/audit/index.js';
import { writeAudit } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { expiredMediaKeys, clearMediaReferences } from '../data/retentionRepo.js';
import { deleteMediaObject } from './s3.js';

/** Delete S3 before clearing references; a failed delete retries without claiming completion. */
export async function purgeMediaInTransaction(tx: PrismaTransactionClient, scope: EventScope,
  input: { now: Date; audit: AuditContext }) {
  const event = await holdCaptureEvent(tx, scope);
  if (!event.closedAt || !['CLOSED', 'ARCHIVED'].includes(event.status)) return 0;
  const days = Number((await loadResolvedSetting('privacy.mediaRetentionDays', {
    ...scope, organisationId: event.organisationId,
  }, tx)).value);
  if (input.now.getTime() < event.closedAt.getTime() + days * 86400000) return 0;
  const keys = await expiredMediaKeys(tx, scope, event.closedAt);
  if (!keys) return 0;
  for (const key of keys) await deleteMediaObject(key);
  await clearMediaReferences(tx, scope);
  await writeAudit(tx, { ...input.audit, eventId: scope.eventId, action: 'media.purge',
    entityType: 'Event', entityId: scope.eventId,
    after: { closedAt: event.closedAt.toISOString(), objects: keys.length, reason: 'retention' } });
  return keys.length;
}
