import type { AnnouncementRecord, CommitteeRole, CreateAnnouncementRequest } from '@spoh/shared';
import { eventToday } from '../../../platform/event/today.js';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { dispatch } from '../../notification/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { requireEventDay } from '../../eventDays/index.js';
import { requireEventStation } from '../../station/index.js';
import {
  createAnnouncement,
  findAnnouncementById,
  findAudienceIds,
  findTodaysPostings,
} from '../data/repo.js';
import { audienceOf } from '../domain/audience.js';
import { assertMaySend, pushPreview } from '../domain/sendRules.js';
import { decorate } from './decorate.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Broadcast and comms (PRODUCT_BRIEF §8).
 *
 * Quiet by default. Only URGENT messages are eligible for a push; everything
 * else lands in the inbox. Volunteers who receive forty pushes stop reading
 * pushes by 11am, and then the one that matters is the one they miss.
 */
export async function sendAnnouncement(
  request: CreateAnnouncementRequest,
  sender: { volunteerId: string; role: CommitteeRole; scope: EventScope },
  audit: AuditContext,
): Promise<AnnouncementRecord> {
  const { scope } = sender;
  const stationId = await requireEventStation(scope, request.target.stationId);
  const eventDayId = await requireEventDay(scope, request.target.eventDayId);
  const today = await eventToday(scope, new Date());
  const postings = await findTodaysPostings(scope, sender.volunteerId, today);
  assertMaySend({ ...sender, todaysStationIds: postings.map((p) => p.stationId) }, stationId);

  const announcement = await prisma.$transaction(async (tx) => {
    const row = await createAnnouncement(tx, scope, {
      body: request.body,
      priority: request.priority,
      targetRole: request.target.role ?? null,
      targetStationId: stationId,
      targetEventDayId: eventDayId,
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

  // One list for the count and the push, so the sender is told how many were reached.
  const audienceIds = await findAudienceIds(scope, audienceOf(announcement), today);
  if (announcement.priority === 'URGENT') pushToDevices(scope, announcement, audienceIds);

  // Loaded after commit: its relations would overlap on the transaction's
  // connection (F03-019).
  const created = await findAnnouncementById(scope, announcement.id);
  if (!created) throw new NotFoundError('Announcement');
  return decorate(scope, created, {
    viewerId: sender.volunteerId,
    audienceCount: audienceIds.length,
  });
}

/**
 * Push an urgent announcement.
 *
 * Only URGENT reaches here — the caller checks the priority — and it goes to
 * exactly the announcement's audience (domain/audience.ts), so a message aimed
 * at one station does not buzz the whole event. The inbox poll delivers it either way; this is what
 * makes it arrive while the app is closed.
 */
function pushToDevices(
  scope: EventScope,
  announcement: { id: string; body: string },
  audienceIds: string[],
): void {
  // Unlike an incident description, this text was written by a coordinator for
  // exactly this audience, so showing it directly is safe and useful.
  void dispatch(scope, {
    kind: 'announcement.urgent',
    priority: 'URGENT',
    title: 'Urgent — SPOH Ops',
    body: pushPreview(announcement.body),
    url: '/inbox',
    tag: `announcement:${announcement.id}`,
    audience: { everyone: false, volunteerIds: audienceIds },
  });
}
