import type { AnnouncementPublicationScheduleRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';

const timeMetadata = (record: AnnouncementPublicationScheduleRecord) => ({
  version: record.version,
  runAt: record.runAt,
  scheduledFor: record.scheduledFor,
  draftId: record.draftId,
  draftVersion: record.draftVersion,
});

export function auditPublicationScheduleEdit(
  tx: PrismaTransactionClient,
  input: {
    audit: AuditContext;
    original: AnnouncementPublicationScheduleRecord;
    updated: AnnouncementPublicationScheduleRecord;
    reason?: string | undefined;
  },
) {
  return writeAudit(tx, {
    ...input.audit,
    action: 'schedule.update',
    entityType: 'ScheduledAction',
    entityId: input.updated.id,
    before: timeMetadata(input.original),
    after: { ...timeMetadata(input.updated), ...(input.reason ? { reason: input.reason } : {}) },
  });
}
