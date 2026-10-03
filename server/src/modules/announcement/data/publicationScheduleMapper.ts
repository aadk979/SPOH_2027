import {
  AnnouncementPublicationScheduleRecord,
  AnnouncementScheduleError,
  PublishAnnouncementPayload,
} from '@spoh/shared';
import type { ScheduledAction } from '../../../generated/prisma/client.js';

export function toPublicationSchedule(row: ScheduledAction) {
  const payload = PublishAnnouncementPayload.parse(row.payload);
  const error = AnnouncementScheduleError.safeParse(row.lastError);
  return AnnouncementPublicationScheduleRecord.parse({
    id: row.id,
    eventId: row.eventId,
    draftId: payload.draftId,
    draftVersion: payload.expectedVersion,
    runAt: row.runAt.toISOString(),
    scheduledFor: (row.scheduledFor ?? row.runAt).toISOString(),
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastError: row.lastError === null ? null : error.success ? error.data : 'EXECUTION_FAILED',
  });
}
