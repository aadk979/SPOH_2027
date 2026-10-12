import { NoticeContext, NoticeRecord } from '@spoh/shared';
import type { NoticeSourceReaders } from '../../../platform/notification/sourceReader.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { OwnedNotice } from '../data/noticeCentreRepo.js';
import { readNoticeSource } from './noticeSource.js';

export function sourceInput(row: OwnedNotice) {
  return { noticeId: row.id, kind: row.kind, priority: row.priority,
    source: { kind: row.sourceKind, id: row.sourceId }, transitionKey: row.transitionKey,
    recipientPersonId: row.recipientPersonId, recipientMembershipId: row.recipientMembershipId,
    createdAt: row.createdAt, expiresAt: row.expiresAt, context: NoticeContext.parse(row.context) };
}
export async function projectNotice(input: { row: OwnedNotice; db: PrismaTransactionClient;
  now: Date; sourceReaders: NoticeSourceReaders }) {
  const visible = await readNoticeSource({ ...input, eventId: input.row.eventId,
    row: sourceInput(input.row) });
  if (!visible) return null;
  const { source, event } = visible;
  return NoticeRecord.parse({ id: input.row.id, eventId: event.id, eventName: event.name,
    eventSlug: event.slug, kind: input.row.kind, priority: input.row.priority,
    createdAt: input.row.createdAt.toISOString(), readAt: input.row.readAt?.toISOString() ?? null,
    title: source.title, summary: source.summary, detail: source.detail,
    destination: source.destination, acknowledgement: source.acknowledgement });
}
