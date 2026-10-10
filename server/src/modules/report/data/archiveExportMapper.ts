import type { ArchiveExportRecord } from '@spoh/shared';
import type { ArchiveExport } from '../../../generated/prisma/client.js';

export function toArchiveExport(row: ArchiveExport): ArchiveExportRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    snapshotId: row.snapshotId,
    objectKey: row.objectKey,
    createdAt: row.createdAt.toISOString(),
    downloadPath: `/events/${row.eventId}/reports/archive-export/${row.id}`,
  };
}
