import {
  roleMeets,
  type AnnouncementRecord,
  type CommitteeRole,
  type CreateAnnouncementRequest,
  type ListAnnouncementsQuery,
} from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../platform/audit/index.js';
import { ForbiddenError, NotFoundError } from '../../platform/errors/index.js';
import { prisma } from '../../platform/db/client.js';
import { eventDayAnchor, singaporeDateString } from '../../platform/time/index.js';
import { findStationById } from '../station/data/repo.js';
import { dispatch } from '../notification/service.js';
import {
  acknowledge,
  acknowledgedIds,
  countAudience,
  createAnnouncement,
  findAnnouncementById,
  listForRecipient,
  toAnnouncementRecord,
} from './repo.js';

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

  /**
   * An IC may address their own station; only a DC and above may address the
   * whole event. Enforced here rather than by two separate routes because the
   * distinction is in the payload, not the path — and the capability check on
   * the route cannot see the payload.
   */
  if (!stationId && !roleMeets(sender.role, 'DEPUTY_COORDINATOR')) {
    throw new ForbiddenError(
      'Only a Deputy Coordinator or above may send an event-wide announcement. Target a station instead.',
    );
  }

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

export async function listInbox(
  query: ListAnnouncementsQuery,
  recipient: { volunteerId: string; role: CommitteeRole },
): Promise<AnnouncementRecord[]> {
  const today = eventDayAnchor(singaporeDateString());

  // Station targeting matches every station this volunteer is rostered at
  // today, not just the one they happen to be standing in right now.
  const assignments = await prisma.shiftAssignment.findMany({
    where: { volunteerId: recipient.volunteerId, eventDay: { date: today } },
    select: { stationId: true, eventDayId: true },
  });

  const announcements = await listForRecipient({
    role: recipient.role,
    stationIds: [...new Set(assignments.map((a) => a.stationId))],
    eventDayIds: [...new Set(assignments.map((a) => a.eventDayId))],
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    now: new Date(),
  });

  const acked = await acknowledgedIds(
    recipient.volunteerId,
    announcements.map((a) => a.id),
  );

  const records = await Promise.all(
    announcements.map(async (announcement) => {
      const station = announcement.targetStationId
        ? await findStationById(announcement.targetStationId)
        : null;

      return toAnnouncementRecord(announcement, {
        stationName: station?.name ?? null,
        ackedByMe: acked.has(announcement.id),
        audienceCount: null,
      });
    }),
  );

  return query.unackedOnly
    ? records.filter((record) => record.requiresAck && !record.ackedByMe)
    : records;
}

export async function acknowledgeAnnouncement(
  announcementId: string,
  volunteerId: string,
): Promise<AnnouncementRecord> {
  const existing = await findAnnouncementById(announcementId);
  if (!existing) throw new NotFoundError('Announcement');

  await acknowledge(announcementId, volunteerId);

  const refreshed = await findAnnouncementById(announcementId);
  if (!refreshed) throw new NotFoundError('Announcement');

  return decorate(refreshed, volunteerId, { includeAudience: false });
}

async function decorate(
  announcement: Awaited<ReturnType<typeof findAnnouncementById>> & object,
  viewerId: string,
  options: { includeAudience: boolean },
): Promise<AnnouncementRecord> {
  const station = announcement.targetStationId
    ? await findStationById(announcement.targetStationId)
    : null;

  const acked = await acknowledgedIds(viewerId, [announcement.id]);

  const audienceCount = options.includeAudience
    ? await countAudience({
        role: announcement.targetRole,
        stationId: announcement.targetStationId,
        eventDayId: announcement.targetEventDayId,
      })
    : null;

  return toAnnouncementRecord(announcement, {
    stationName: station?.name ?? null,
    ackedByMe: acked.has(announcement.id),
    audienceCount,
  });
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
  // exactly this audience, so showing it directly is safe and useful. Truncated
  // here rather than left to the lock screen, which cuts mid-word.
  const preview =
    announcement.body.length > 140 ? `${announcement.body.slice(0, 137)}...` : announcement.body;

  void dispatch({
    kind: 'announcement.urgent',
    priority: 'URGENT',
    title: 'Urgent — SPOH Ops',
    body: preview,
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
