import type { AnnouncementDraftRecord, CreateAnnouncementRequest } from '@spoh/shared';
import type { AnnouncementDraft } from '../../../generated/prisma/client.js';
import type { DraftContent } from './draftRepo.js';

export function draftContent(request: CreateAnnouncementRequest): DraftContent {
  return {
    body: request.body,
    priority: request.priority,
    targetRole: request.target.role ?? null,
    targetStationId: request.target.stationId ?? null,
    targetEventDayId: request.target.eventDayId ?? null,
    requiresAck: request.requiresAck,
    expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
  };
}

export function toDraftRecord(
  row: AnnouncementDraft & {
    publication?: { announcementId: string; publishedAt: Date } | null;
  },
): AnnouncementDraftRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    authorId: row.authorId,
    authorMembershipId: row.authorMembershipId,
    version: row.version,
    body: row.body,
    priority: row.priority,
    requiresAck: row.requiresAck,
    target: {
      role: row.targetRole,
      stationId: row.targetStationId,
      eventDayId: row.targetEventDayId,
    },
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publication?.publishedAt.toISOString() ?? null,
    publishedAnnouncementId: row.publication?.announcementId ?? null,
  };
}

/** An identical full replacement does not invent a change, version or receipt. */
export function draftContentMatches(row: AnnouncementDraft, data: DraftContent): boolean {
  return (
    row.body === data.body &&
    row.priority === data.priority &&
    row.targetRole === data.targetRole &&
    row.targetStationId === data.targetStationId &&
    row.targetEventDayId === data.targetEventDayId &&
    row.requiresAck === data.requiresAck &&
    row.expiresAt?.getTime() === data.expiresAt?.getTime()
  );
}

/** Audit metadata names changes without retaining another copy of unpublished text. */
export function draftAuditMetadata(row: AnnouncementDraft) {
  return {
    version: row.version,
    priority: row.priority,
    targetRole: row.targetRole,
    targetStationId: row.targetStationId,
    targetEventDayId: row.targetEventDayId,
    requiresAck: row.requiresAck,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

export function publicationAuditMetadata(
  row: AnnouncementDraft,
  plan: { recipientCount: number; deviceCount: number } | null,
) {
  return {
    draftId: row.id,
    ...draftAuditMetadata(row),
    recipientCount: plan?.recipientCount ?? null,
    deviceCount: plan?.deviceCount ?? 0,
  };
}
