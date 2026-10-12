import type { NoticeSourceInput, NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { readableCollectionStations } from '../../../platform/workspace/sourceRead.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import { giftNoticeMetadata, giftNoticeTransition } from '../data/noticeSourceRepo.js';
function validNotice(personId: string, notice: NoticeSourceInput) {
  return notice.kind === 'GIFT_LOW_STOCK' && notice.context.type === 'gift' && !notice.context.rehearsal
    && notice.recipientPersonId === personId
    && notice.transitionKey === `gift:${notice.source.id}:low:${notice.context.transitionId}`;
}
async function canReadStock(context: ReadContext) {
  try { await readableCollectionStations(context, 'Dashboard.ReadStation'); }
  catch (error) { if (error instanceof ForbiddenError) return false; throw error; }
  return true;
}
export const readGiftNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (!validNotice(context.personId, notice) || notice.context.type !== 'gift' || !await canReadStock(context)) return null;
  if (!await giftNoticeTransition(context.scope, { db: context.db, giftId: notice.source.id,
    id: notice.context.transitionId, type: notice.context.transitionType })) return null;
  const gift = await giftNoticeMetadata(context.scope, { db: context.db, id: notice.source.id });
  if (!gift?.active || gift.remaining > gift.lowStockThreshold) return null;
  const title = `${gift.name} is running low`;
  const body = `${gift.remaining} left. Check stock and brief the gift desk.`;
  return { title, summary: body, detail: null, acknowledgement: null,
    destination: { type: 'entity', target: { kind: 'gift', id: gift.id } },
    push: { kind: 'gift.lowStock', priority: 'OPERATIONAL', title, body,
      tag: `gift:${gift.id}`, validUntil: null } };
};
