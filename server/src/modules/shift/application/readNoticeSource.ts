import type { NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import { swapNoticeMetadata } from '../data/noticeSourceRepo.js';

export const readSwapNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (!context.membershipId || notice.recipientPersonId !== context.personId || notice.context.type !== 'swap') return null;
  if (!await context.canRead({ action: 'Self.Read', resource: { type: 'Membership', id: context.membershipId } })) return null;
  const swap = await swapNoticeMetadata(context.scope, { db: context.db, id: notice.source.id });
  if (!swap || (swap.requesterId !== context.personId && swap.targetId !== context.personId)
    || notice.kind !== `SWAP_${swap.status}` || notice.transitionKey !== `swap:${swap.id}:${swap.status}`) return null;
  const title = `Swap ${swap.status.toLowerCase()}`;
  const body = 'Your swap request has an update. Check swaps and your current shift.';
  return { title, summary: body, detail: null, acknowledgement: null,
    destination: { type: 'action', path: '/swaps' },
    push: { kind: 'swap.decision', priority: 'OPERATIONAL', title, body,
      tag: `swap:${swap.id}`, validUntil: null } };
};
