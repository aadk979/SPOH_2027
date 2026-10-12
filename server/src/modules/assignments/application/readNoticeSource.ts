import type { NoticeSourceInput, NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import { assignmentNoticeMetadata } from '../data/noticeSourceRepo.js';

function validNotice(personId: string, notice: NoticeSourceInput) {
  return notice.recipientPersonId === personId && notice.context.type === 'assignment'
    && notice.transitionKey.startsWith(`assignment:${notice.source.id}:change:`)
    && ['ASSIGNMENT_CHANGED', 'ASSIGNMENT_REMOVED'].includes(notice.kind);
}
function ownCurrentAssignment(personId: string, notice: NoticeSourceInput,
  assignment: Awaited<ReturnType<typeof assignmentNoticeMetadata>>) {
  if (!assignment || notice.context.type !== 'assignment') return false;
  return assignment.volunteerId === personId && assignment.stationId === notice.context.stationId
    && assignment.shiftId === notice.context.shiftId && assignment.eventDayId === notice.context.eventDayId;
}
function currentTransition(notice: NoticeSourceInput, assignment: Awaited<ReturnType<typeof assignmentNoticeMetadata>>) {
  if (notice.context.type !== 'assignment') return false;
  const removed = notice.kind === 'ASSIGNMENT_REMOVED';
  return removed === (notice.context.operation === 'REMOVED') && !(removed && assignment);
}
/** Historical recipient context never unlocks a current assignment or its former station. */
export const readAssignmentNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (!context.membershipId || !validNotice(context.personId, notice) || notice.context.type !== 'assignment') return null;
  if (!await context.canRead({ action: 'Self.Read', resource: { type: 'Membership', id: context.membershipId } })) return null;
  const assignment = await assignmentNoticeMetadata(context.scope, { db: context.db, id: notice.source.id });
  const removed = notice.kind === 'ASSIGNMENT_REMOVED';
  if (!currentTransition(notice, assignment)) return null;
  const currentOwn = ownCurrentAssignment(context.personId, notice, assignment);
  const title = removed ? 'Assignment removed' : 'Assignment changed';
  const body = removed ? 'A previous assignment was removed. Check My shift for your current roster.'
    : 'Your roster changed. Check My shift for your current assignment.';
  return { title, summary: body, detail: null, acknowledgement: null,
    destination: currentOwn && assignment ? { type: 'entity', target: { kind: 'assignment', id: assignment.id } }
      : { type: 'action', path: '/shift' },
    push: { kind: 'assignment.changed', priority: 'OPERATIONAL', title, body,
      tag: `assignment:${notice.source.id}`, validUntil: null } };
};
