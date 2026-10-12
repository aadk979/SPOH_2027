import type { NoticeHistoryReader } from '../../../platform/notification/historyReader.js';
import { eventDayAnchorOf } from '../../../platform/time/index.js';
import { materialiseNotices } from '../../notification/index.js';
import { announcementNoticeHistory, noticeAnnouncementEvent, noticeAnnouncementRecipient } from '../data/noticeSourceRepo.js';

const MAX_HISTORY = 100;

export const materialiseAnnouncementNoticeHistory: NoticeHistoryReader = async (context) => {
  if (!context.membershipId || !await context.canRead({ action: 'Self.Read',
    resource: { type: 'Membership', id: context.membershipId } })) return { complete: true };
  const event = await noticeAnnouncementEvent(context.scope, context.db);
  const recipient = await noticeAnnouncementRecipient(context.scope, { db: context.db,
    personId: context.personId, today: eventDayAnchorOf(context.now, event) });
  if (!recipient) return { complete: true };
  const rows = await announcementNoticeHistory(context.scope, { db: context.db,
    personId: context.personId, recipient, now: context.now, limit: MAX_HISTORY });
  for (const row of rows.slice(0, MAX_HISTORY)) {
    await materialiseNotices(context.db, context.scope, { kind: 'ANNOUNCEMENT_PUBLISHED', priority: row.priority,
      source: { kind: 'ANNOUNCEMENT', id: row.id }, transitionKey: `announcement:${row.id}:published`,
      context: { type: 'announcement' }, recipientPersonIds: [context.personId],
      createdAt: row.createdAt, expiresAt: row.expiresAt });
  }
  return { complete: rows.length <= MAX_HISTORY };
};
