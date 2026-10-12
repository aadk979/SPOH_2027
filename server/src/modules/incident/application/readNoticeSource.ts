import type { NoticeSourceReader } from '../../../platform/notification/sourceReader.js';
import { incidentNoticeMetadata } from '../data/noticeSourceRepo.js';
import { pushesToSafetyChain } from '../domain/safetyPush.js';

export const readIncidentNoticeSource: NoticeSourceReader = async (context, notice) => {
  if (notice.kind !== 'INCIDENT_RAISED' || notice.context.type !== 'incident'
    || notice.recipientPersonId !== context.personId
    || notice.transitionKey !== `incident:${notice.source.id}:raised`) return null;
  if (!await context.canRead({ action: 'Incident.Read', resource: { type: 'Incident', id: notice.source.id } })) return null;
  const incident = await incidentNoticeMetadata(context.scope, { db: context.db, id: notice.source.id });
  if (!incident || !pushesToSafetyChain(incident.severity) || incident.reportedById === context.personId) return null;
  const title = `${incident.rehearsal ? 'Rehearsal: ' : ''}${incident.severity} incident reported`;
  const body = 'A severe incident needs attention. Open the incident for the current details.';
  return { title, summary: body, detail: null, acknowledgement: null,
    destination: { type: 'entity', target: { kind: 'incident', id: incident.id } },
    push: { kind: 'incident.critical', priority: 'URGENT', title, body,
      tag: `incident:${incident.id}`, validUntil: null } };
};
