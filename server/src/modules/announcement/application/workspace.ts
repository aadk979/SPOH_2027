import { mapReadRows } from '../../../platform/workspace/sourceRead.js';
import type { EntityRef, RecordRow, RecordsRequest, SearchRequest, SearchResponse, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { readableStationIds } from '../../../platform/access/readStations.js';
import { eventDayAnchorOf } from '../../../platform/time/index.js';
import { boundedPage, observedTime } from '../../../platform/workspace/observation.js';
import { actorRelated, stationRelated } from '../../../platform/workspace/related.js';
import { entityLink, entityProjection, field, recordsProjection, type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { announcementWorkspaceMetadata, announcementWorkspacePage, announcementWorkspaceWhere,
  announcementWorkspaceAcknowledgements, ownSenderWorkspaceBody, workspaceAnnouncementEvent, type AnnouncementWorkspaceAudience } from '../data/workspaceRepo.js';
import { noticeAnnouncementRecipient, permittedNoticeAnnouncement } from '../data/noticeSourceRepo.js';
import { audienceOf, reaches } from '../domain/audience.js';

type Row = NonNullable<Awaited<ReturnType<typeof announcementWorkspaceMetadata>>>;
async function audience(context: ReadContext): Promise<AnnouncementWorkspaceAudience> {
  const event = await workspaceAnnouncementEvent(context);
  const self = !!context.membershipId && await context.canRead({ action: 'Self.Read', resource: { type: 'Membership', id: context.membershipId } });
  const recipient = self ? await noticeAnnouncementRecipient(context.scope, { db: context.db,
    personId: context.personId, today: eventDayAnchorOf(context.now, event) }) : null;
  const senderEvent = await context.canRead({ action: 'Announcement.SendEvent', resource: { type: 'Event', id: context.scope.eventId } });
  const senderStationIds = await readableStationIds(context, 'Announcement.SendStation');
  const archiveMetadata = event.status === 'ARCHIVED' && await context.canRead({ action: 'Audit.Read', resource: { type: 'Event', id: context.scope.eventId } });
  if (!self && !senderEvent && !senderStationIds.length && !archiveMetadata) throw new ForbiddenError();
  return { recipient, senderEvent, senderStationIds, archiveMetadata, eventId: context.scope.eventId, personId: context.personId,
    ...(context.membershipId ? { membershipId: context.membershipId } : {}), now: context.now, today: eventDayAnchorOf(context.now, event) };
}
function recipientCanRead(visibility: AnnouncementWorkspaceAudience, row: Row) {
  return !!visibility.recipient && (!row.expiresAt || row.expiresAt > visibility.now) && reaches(audienceOf(row), visibility.recipient);
}
function senderCanRead(visibility: AnnouncementWorkspaceAudience, row: Row) {
  return row.authorId === visibility.personId && (row.targetStationId
    ? visibility.senderStationIds.includes(row.targetStationId) : visibility.senderEvent);
}
function fields(row: Row) {
  return [field('Priority', row.priority), field('Created at', row.createdAt.toISOString(), 'instant'),
    field('Expires at', row.expiresAt?.toISOString() ?? null, 'instant'), field('Target role', row.targetRole),
    field('Acknowledgement required', row.requiresAck, 'boolean')];
}
async function related(context: ReadContext, row: Row) {
  const links: WorkspaceLink[] = [...await stationRelated(context, row.targetStationId), ...await actorRelated(context, row.authorId)];
  if (row.targetEventDayId && await context.canRead({ action: 'Structure.Read', resource: { type: 'Event', id: context.scope.eventId } }))
    links.push(entityLink('Target day', { kind: 'event-day', id: row.targetEventDayId }));
  return links;
}
async function readableBody(context: ReadContext, row: Row, visibility: AnnouncementWorkspaceAudience) {
  if (recipientCanRead(visibility, row)) {
    const event = await workspaceAnnouncementEvent(context);
    const source = await permittedNoticeAnnouncement(context.scope, { db: context.db, id: row.id,
      personId: context.personId, now: context.now, today: eventDayAnchorOf(context.now, event), audience: audienceOf(row) });
    if (source) return source.body;
  }
  if (!senderCanRead(visibility, row) || !context.membershipId || !visibility.recipient) return null;
  const body = await ownSenderWorkspaceBody(context, { id: row.id, personId: context.personId,
    membershipId: context.membershipId, role: visibility.recipient.role });
  return body?.body ?? null;
}
async function acknowledgementFields(context: ReadContext, row: Row, visibility: AnnouncementWorkspaceAudience) {
  const own = recipientCanRead(visibility, row);
  const observation = await announcementWorkspaceAcknowledgements(context, { id: row.id, personId: context.personId,
    own, aggregate: senderCanRead(visibility, row), asOf: context.now });
  return [...(own ? [field('Acknowledged by me', observation.own !== null, 'boolean'),
    field('My acknowledgement at', observation.own, 'instant')] : []),
  ...(observation.count === null ? [] : [field('Acknowledgements observed', observation.count, 'number')])];
}
async function entity(context: ReadContext, ref: EntityRef) {
  const visibility = await audience(context);
  const row = await announcementWorkspaceMetadata(context, ref.id, announcementWorkspaceWhere(context, { audience: visibility }));
  if (!row) return null;
  const body = await readableBody(context, row, visibility);
  const result = entityProjection(context, ref, { title: `${row.priority.toLowerCase()} announcement`,
    fields: [...fields(row), ...(body === null ? [] : [field('Message', body), ...await acknowledgementFields(context, row, visibility)])], related: await related(context, row) });
  result.facets.push({ name: 'Message', availability: body === null ? 'denied' : 'available',
    ...(body === null ? { explanation: 'Saved metadata does not grant access to the current message body.' } : {}) });
  result.facets.push({ name: 'Acknowledgements', availability: body === null ? 'denied' : 'available',
    explanation: body === null ? 'Acknowledgement details require current message access.' : 'The observation contains no named acknowledgement rows.' });
  if (body !== null) result.actions.push({ label: 'Open announcement inbox', destination: { type: 'action', path: '/inbox', query: { id: row.id } } });
  return result;
}
async function records(context: ReadContext, request: RecordsRequest) {
  if (request.filter.kind !== 'announcements') throw new ValidationError('Choose announcement records.');
  const visibility = await audience(context);
  const result = await announcementWorkspacePage(context, { where: announcementWorkspaceWhere(context, { audience: visibility,
    filter: request.filter, time: await observedTime(context, request.filter) }), limit: request.limit,
    ...(request.cursor ? { cursor: request.cursor } : {}) });
  if (!result.cursorValid) throw new NotFoundError('Records cursor');
  const page = boundedPage(result.rows, request.limit);
  const data: RecordRow[] = await mapReadRows(page.rows, async (row) => ({ id: row.id, title: `${row.priority.toLowerCase()} announcement`,
    recordedAt: row.createdAt.toISOString(), fields: fields(row), destination: { kind: 'announcement', id: row.id }, related: await related(context, row) }));
  return recordsProjection(context, request, { data, count: result.count, aggregate: { value: result.count, unit: 'announcements' }, nextCursor: page.nextCursor });
}
async function search(context: ReadContext, input: SearchRequest): Promise<SearchResponse['data']> {
  let visibility: AnnouncementWorkspaceAudience;
  try { visibility = await audience(context); } catch (error) { if (error instanceof ForbiddenError) return []; throw error; }
  const result = await announcementWorkspacePage(context, { where: announcementWorkspaceWhere(context,
    { audience: visibility, query: input.query }), limit: input.limit });
  return result.rows.slice(0, input.limit).map((row) => ({ title: `${row.priority.toLowerCase()} announcement`,
    detail: row.requiresAck ? 'Acknowledgement requested' : 'Published notice', destination: { kind: 'announcement', id: row.id } }));
}
export const announcementWorkspaceSource: WorkspaceSource = { entity, records, search };
