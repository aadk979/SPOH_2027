import type { NoticeSourceInput, NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import { roleMeets } from '@spoh/shared';
import { fallbackNoticeMetadata, fallbackNoticeMember } from '../data/noticeSourceRepo.js';

function validNotice(personId: string, notice: NoticeSourceInput) {
  return notice.recipientPersonId === personId && notice.kind === 'FALLBACK_REMINDER'
    && notice.context.type === 'fallback'
    && notice.transitionKey === `fallback:${notice.source.id}:remind:${notice.context.sequence}`;
}
export const readFallbackNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (!context.membershipId || !validNotice(context.personId, notice) || notice.context.type !== 'fallback') return null;
  const window = await fallbackNoticeMetadata(context.scope, { db: context.db,
    id: notice.source.id, sequence: notice.context.sequence });
  if (!window) return null;
  const member = await fallbackNoticeMember(context.scope, { db: context.db, membershipId: context.membershipId,
    personId: context.personId });
  if (!member || (window.declaredById !== context.personId
    && !roleMeets(member.role, 'DEPUTY_COORDINATOR'))) return null;
  if (!await context.canRead(window.stationId
    ? { action: 'Dashboard.ReadStation', resource: { type: 'Station', id: window.stationId } }
    : { action: 'Dashboard.ReadEvent', resource: { type: 'Event', id: context.scope.eventId } })) return null;
  const title = 'A fallback window is still open';
  const body = 'Close the window once the app is back, then import the paper records.';
  return { title, summary: body, detail: null, acknowledgement: null,
    destination: { type: 'entity', target: { kind: 'fallback', id: window.id } },
    push: { kind: 'fallback.reminder', priority: 'OPERATIONAL', title, body,
      tag: `fallback:${window.id}`, validUntil: null } };
};
