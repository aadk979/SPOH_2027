import type { NoticeSourceInput, NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { eventDayAnchorOf } from '../../../platform/time/index.js';
import { audienceOf, reaches } from '../domain/audience.js';
import { pushPreview } from '../domain/sendRules.js';
import { announcementNoticeMetadata, noticeAnnouncementEvent,
  noticeAnnouncementRecipient, permittedNoticeAnnouncement } from '../data/noticeSourceRepo.js';

function validNotice(context: ReadContext, notice: NoticeSourceInput) {
  return notice.kind === 'ANNOUNCEMENT_PUBLISHED' && notice.context.type === 'announcement'
    && notice.transitionKey === `announcement:${notice.source.id}:published`
    && notice.recipientPersonId === context.personId && !!context.membershipId;
}
function currentMetadata(metadata: Awaited<ReturnType<typeof announcementNoticeMetadata>>, notice: NoticeSourceInput, now: Date) {
  return metadata && metadata.priority === notice.priority && (!metadata.expiresAt || metadata.expiresAt > now);
}
async function acknowledgement(context: ReadContext, input: {
  metadata: NonNullable<Awaited<ReturnType<typeof announcementNoticeMetadata>>>; acknowledged: boolean;
}) {
  if (!input.metadata.requiresAck) return null;
  const canAcknowledge = !input.acknowledged && await context.canRead({ action: 'Announcement.Ack',
    resource: { type: 'Announcement', id: input.metadata.id } });
  return { kind: 'ANNOUNCEMENT' as const, sourceId: input.metadata.id,
    acknowledged: input.acknowledged, canAcknowledge };
}

/** Audience and policy are checked before message text is fetched. */
export const readAnnouncementNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (!validNotice(context, notice)) return null;
  if (!await context.canRead({ action: 'Self.Read',
    resource: { type: 'Membership', id: context.membershipId! } })) return null;
  const metadata = await announcementNoticeMetadata(context.scope, { db: context.db, id: notice.source.id });
  if (!metadata || !currentMetadata(metadata, notice, context.now)) return null;
  const event = await noticeAnnouncementEvent(context.scope, context.db);
  const recipient = await noticeAnnouncementRecipient(context.scope, { db: context.db,
    personId: context.personId, today: eventDayAnchorOf(context.now, event) });
  if (!recipient || !reaches(audienceOf(metadata), recipient)) return null;
  const source = await permittedNoticeAnnouncement(context.scope, { db: context.db,
    id: notice.source.id, personId: context.personId, today: eventDayAnchorOf(context.now, event),
    now: context.now, audience: audienceOf(metadata) });
  if (!source) return null;
  return { title: 'Announcement', summary: pushPreview(source.body), detail: source.body,
    destination: { type: 'entity', target: { kind: 'announcement', id: metadata.id } },
    acknowledgement: await acknowledgement(context, { metadata, acknowledged: source.acknowledged }),
    push: metadata.priority === 'OPERATIONAL' ? { kind: 'announcement.operational',
      priority: 'OPERATIONAL', title: 'Operational announcement', body: pushPreview(source.body),
      tag: `announcement:${metadata.id}`, validUntil: metadata.expiresAt } : null };
};
