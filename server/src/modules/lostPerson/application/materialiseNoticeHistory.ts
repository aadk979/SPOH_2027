import type { NoticeHistoryReader } from '../../../platform/notification/historyReader.js';
import { materialiseNotices } from '../../notification/index.js';
import { activeLostPersonNoticeHistory } from '../data/noticeSourceRepo.js';

const MAX_HISTORY = 100;

export const materialiseLostPersonNoticeHistory: NoticeHistoryReader = async (context) => {
  if (!context.membershipId || !await context.canRead({ action: 'Self.Read',
    resource: { type: 'Membership', id: context.membershipId } })) return { complete: true };
  const rows = await activeLostPersonNoticeHistory(context.scope, { db: context.db,
    personId: context.personId, limit: MAX_HISTORY });
  for (const row of rows.slice(0, MAX_HISTORY)) {
    await materialiseNotices(context.db, context.scope, { kind: 'LOST_PERSON_RAISED', priority: 'URGENT',
      source: { kind: 'LOST_PERSON', id: row.id }, transitionKey: `lostPerson:${row.id}:raised`,
      context: { type: 'lost-person' }, recipientPersonIds: [context.personId], createdAt: row.raisedAt });
  }
  return { complete: rows.length <= MAX_HISTORY };
};
