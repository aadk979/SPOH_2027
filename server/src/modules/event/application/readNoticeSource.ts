import type { NoticeSourceInput, NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import { archiveNoticeMetadata } from '../data/noticeSourceRepo.js';

function validNotice(personId: string, eventId: string, notice: NoticeSourceInput) {
  return notice.kind === 'ARCHIVE_REMINDER' && notice.context.type === 'event'
    && notice.recipientPersonId === personId && notice.source.id === eventId
    && notice.transitionKey === `event:${eventId}:archive:${notice.context.lifecycleVersion}`;
}
export const readArchiveNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (!validNotice(context.personId, context.scope.eventId, notice) || notice.context.type !== 'event') return null;
  if (!await context.canRead({ action: 'Platform.AdministerEvent', asPerson: true,
    resource: { type: 'Event', id: context.scope.eventId } })) return null;
  const event = await archiveNoticeMetadata(context.scope, context.db);
  if (!event || event.status !== 'CLOSED' || event.lifecycleVersion !== notice.context.lifecycleVersion) return null;
  const title = `${event.name} is ready to archive`;
  const body = 'Check close-out, save the final export and archive this event.';
  return { title, summary: body, detail: null, acknowledgement: null,
    destination: context.membershipId ? { type: 'action', path: '/admin/close-out' }
      : { type: 'platform', path: '/events', eventId: context.scope.eventId },
    push: { kind: 'event.archiveReminder', priority: 'OPERATIONAL', title, body,
      tag: `archive:${context.scope.eventId}`, validUntil: null } };
};
