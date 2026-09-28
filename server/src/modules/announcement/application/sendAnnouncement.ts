import type { AnnouncementRecord, CommitteeRole, CreateAnnouncementRequest } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { dispatch } from '../../notification/index.js';
import { createAnnouncement } from '../data/repo.js';
import { assertMaySend, pushPreview } from '../domain/sendRules.js';
import { decorate } from './decorate.js';

/**
 * Broadcast and comms (PRODUCT_BRIEF §8).
 *
 * Quiet by default. Only URGENT messages are eligible for a push; everything
 * else lands in the inbox. Volunteers who receive forty pushes stop reading
 * pushes by 11am, and then the one that matters is the one they miss.
 */
export async function sendAnnouncement(
  request: CreateAnnouncementRequest,
  sender: { volunteerId: string; role: CommitteeRole },
  audit: AuditContext,
): Promise<AnnouncementRecord> {
  const stationId = request.target.stationId ?? null;
  assertMaySend(sender, stationId);

  const announcement = await prisma.$transaction(async (tx) => {
    const row = await createAnnouncement(tx, {
      body: request.body,
      priority: request.priority,
      targetRole: request.target.role ?? null,
      targetStationId: stationId,
      targetEventDayId: request.target.eventDayId ?? null,
      requiresAck: request.requiresAck,
      authorId: sender.volunteerId,
      expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'announcement.send',
      entityType: 'Announcement',
      entityId: row.id,
      after: {
        priority: row.priority,
        targetRole: row.targetRole,
        targetStationId: row.targetStationId,
        requiresAck: row.requiresAck,
      },
    });

    return row;
  });

  if (announcement.priority === 'URGENT') pushToDevices(announcement);

  return decorate(announcement, sender.volunteerId, { includeAudience: true });
}

/**
 * Push an urgent announcement.
 *
 * Only URGENT reaches here — the caller checks the priority — and the audience
 * is the announcement's own targeting, so a message aimed at one station does
 * not buzz the whole event. The inbox poll delivers it either way; this is what
 * makes it arrive while the app is closed.
 */
function pushToDevices(announcement: {
  id: string;
  body: string;
  targetRole: CommitteeRole | null;
  targetStationId: string | null;
}): void {
  // Unlike an incident description, this text was written by a coordinator for
  // exactly this audience, so showing it directly is safe and useful.
  void dispatch({
    kind: 'announcement.urgent',
    priority: 'URGENT',
    title: 'Urgent — SPOH Ops',
    body: pushPreview(announcement.body),
    url: '/inbox',
    tag: `announcement:${announcement.id}`,
    audience: {
      everyone: announcement.targetRole === null && announcement.targetStationId === null,
      ...(announcement.targetRole ? { minimumRole: announcement.targetRole } : {}),
      ...(announcement.targetStationId ? { stationId: announcement.targetStationId } : {}),
      volunteerIds: [],
    },
  });
}
