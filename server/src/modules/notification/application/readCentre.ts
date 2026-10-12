import type { ListNoticesQuery, NoticeRecord } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { NoticeSourceReaders } from '../../../platform/notification/sourceReader.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { currentNoticeEvents } from '../data/noticeStandingRepo.js';
import { noticeCandidates, ownNotice, ownNoticeAnchor, type OwnedNotice } from '../data/noticeCentreRepo.js';
import { projectNotice } from './noticeProjection.js';

export type NoticeHistoryMaterialiser = (db: PrismaTransactionClient, input: {
  personId: string; eventId?: string; now: Date;
}) => Promise<{ complete: boolean }>;
export interface CentreReader { personId: string; sourceReaders: NoticeSourceReaders; clock?: Clock;
  materialiseHistory?: NoticeHistoryMaterialiser }
const MAX_SCAN = 500;
const PROJECTION_BATCH = 8;

/** One request owns one view. Page and unread metadata share the exact source projection;
 * no result, standing or authorization decision survives this request. */
function requestProjection(reader: CentreReader, now: Date) {
  const projected = new Map<string, Promise<NoticeRecord | null>>();
  return (row: OwnedNotice) => {
    let record = projected.get(row.id);
    if (!record) {
      record = projectNotice({ row, db: prisma, now, sourceReaders: reader.sourceReaders });
      projected.set(row.id, record);
    }
    return record;
  };
}

type Projection = ReturnType<typeof requestProjection>;
async function projectBatch(rows: readonly OwnedNotice[], project: Projection, start: number) {
  // Source readers still check each exact current resource before fetching its body.
  // Bounded independent reads avoid hundreds of serial membership-fact round trips.
  return Promise.all(rows.slice(start, start + PROJECTION_BATCH).map(project));
}

async function pageRecords(candidates: readonly OwnedNotice[], limit: number, project: Projection) {
  const rows = candidates.slice(0, MAX_SCAN); const data: NoticeRecord[] = [];
  let scanned = 0;
  for (let start = 0; start < rows.length; start += PROJECTION_BATCH) {
    for (const record of await projectBatch(rows, project, start)) {
      scanned += 1;
      if (record) data.push(record);
      if (data.length === limit) return { data, scanned };
    }
  }
  return { data, scanned };
}

async function visiblePage(query: ListNoticesQuery, reader: CentreReader) {
  const now = (reader.clock ?? systemClock).now();
  const events = await currentNoticeEvents(prisma, { personId: reader.personId,
    ...(query.eventId ? { eventId: query.eventId } : {}) });
  const scope = { eventIds: events.map((event) => event.id) };
  const candidateQuery = { ...query, db: prisma, personId: reader.personId, limit: MAX_SCAN };
  if (query.cursor && !await ownNoticeAnchor(scope, candidateQuery)) throw new NotFoundError('Notification page');
  const candidates = await noticeCandidates(scope, candidateQuery);
  const project = requestProjection(reader, now);
  const { data, scanned } = await pageRecords(candidates, query.limit, project);
  return { data, scope, now, project, more: scanned < candidates.length,
    cursor: scanned ? candidates[scanned - 1]!.id : null };
}

async function visibleUnread(input: Awaited<ReturnType<typeof visiblePage>>, reader: CentreReader) {
  const candidates = await noticeCandidates(input.scope, { db: prisma, personId: reader.personId,
    unreadOnly: true, limit: MAX_SCAN });
  let count = 0;
  const rows = candidates.slice(0, MAX_SCAN);
  for (let start = 0; start < rows.length; start += PROJECTION_BATCH) {
    for (const record of await projectBatch(rows, input.project, start)) if (record) count += 1;
  }
  return { count, complete: candidates.length <= MAX_SCAN };
}

export async function readNoticeCentre(query: ListNoticesQuery, reader: CentreReader) {
  const history = reader.materialiseHistory ? await prisma.$transaction((db) => reader.materialiseHistory!(db, {
    personId: reader.personId, ...(query.eventId ? { eventId: query.eventId } : {}),
    now: (reader.clock ?? systemClock).now() })) : { complete: true };
  const page = await visiblePage(query, reader);
  const unread = await visibleUnread(page, reader);
  return { data: page.data, meta: { count: page.data.length,
    nextCursor: page.more ? page.cursor : null, unreadCount: unread.count,
    unreadCountComplete: unread.complete && history.complete, visibilityScanComplete: !page.more && history.complete } };
}

export async function readNoticeDetail(id: string, reader: CentreReader) {
  const events = await currentNoticeEvents(prisma, { personId: reader.personId });
  const row = await ownNotice({ eventIds: events.map((event) => event.id) },
    { db: prisma, personId: reader.personId, id });
  const data = row ? await projectNotice({ row, db: prisma,
    now: (reader.clock ?? systemClock).now(), sourceReaders: reader.sourceReaders }) : null;
  if (!data) throw new NotFoundError('Notification');
  return { data };
}
