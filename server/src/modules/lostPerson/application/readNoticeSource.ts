import type { NoticeSourceInput, NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { lostPersonNoticeMetadata } from '../data/noticeSourceRepo.js';

function validNotice(context: ReadContext, notice: NoticeSourceInput) {
  return !!context.membershipId && notice.recipientPersonId === context.personId
    && notice.context.type === 'lost-person';
}
function currentTransition(notice: NoticeSourceInput, alert: NonNullable<Awaited<ReturnType<typeof lostPersonNoticeMetadata>>>) {
  const raised = notice.kind === 'LOST_PERSON_RAISED';
  if (!raised && notice.kind !== 'LOST_PERSON_RESOLVED') return false;
  if (alert.rehearsal && alert.event.status !== 'REHEARSAL') return false;
  const transition = raised ? 'raised' : 'resolved';
  return notice.transitionKey === `lostPerson:${alert.id}:${transition}`
    && (raised ? alert.status === 'ACTIVE' : !!alert.resolvedAt);
}
async function acknowledgement(context: ReadContext, alert: NonNullable<Awaited<ReturnType<typeof lostPersonNoticeMetadata>>>, raised: boolean) {
  if (!raised) return null;
  const canAcknowledge = !alert.acknowledged && await context.canRead({
    action: 'Alert.Ack', resource: { type: 'LostPersonAlert', id: alert.id } });
  return { kind: 'LOST_PERSON' as const, sourceId: alert.id, acknowledged: alert.acknowledged, canAcknowledge };
}

export const readLostPersonNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (!validNotice(context, notice)) return null;
  if (!await context.canRead({ action: 'Self.Read', resource: { type: 'Membership', id: context.membershipId! } })) return null;
  const alert = await lostPersonNoticeMetadata(context.scope, { db: context.db,
    id: notice.source.id, personId: context.personId });
  if (!alert || !currentTransition(notice, alert)) return null;
  const raised = notice.kind === 'LOST_PERSON_RAISED';
  const title = `${alert.rehearsal ? 'Rehearsal: ' : ''}Lost-person alert ${raised ? 'raised' : 'resolved'}`;
  const body = raised ? 'A search is active. Open the alert for the current details.'
    : 'The search has ended. Stand down and check the resolved alert.';
  return { title, summary: body, detail: null,
    destination: { type: 'entity', target: { kind: 'lost-person', id: alert.id } },
    acknowledgement: await acknowledgement(context, alert, raised),
    push: { kind: raised ? 'lostPerson.raised' : 'lostPerson.resolved', priority: 'URGENT',
      title, body, tag: `lostPerson:${alert.id}`, validUntil: null } };
};
