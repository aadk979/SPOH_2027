import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';

export interface NoticeCandidateScope { readonly eventIds: readonly string[] }
export interface NoticeCandidateQuery { db: PrismaTransactionClient; personId: string;
  unreadOnly?: boolean; cursor?: string; limit: number }

function candidateWhere(scope: NoticeCandidateScope, query: NoticeCandidateQuery): Prisma.NoticeWhereInput {
  return { eventId: { in: [...scope.eventIds] }, recipientPersonId: query.personId,
    ...(query.unreadOnly ? { readAt: null } : {}) };
}
export function ownNoticeAnchor(scope: NoticeCandidateScope, query: NoticeCandidateQuery) {
  return query.db.notice.findFirst({ where: { ...candidateWhere(scope, query), id: query.cursor },
    select: { id: true, eventId: true, createdAt: true } });
}
export async function noticeCandidates(scope: NoticeCandidateScope, query: NoticeCandidateQuery) {
  const anchor = query.cursor ? await ownNoticeAnchor(scope, query) : null;
  return query.db.notice.findMany({ where: { ...candidateWhere(scope, query),
    ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 });
}
export function ownNotice(scope: NoticeCandidateScope, input: {
  db: PrismaTransactionClient; personId: string; id: string;
}) {
  return input.db.notice.findFirst({ where: { eventId: { in: [...scope.eventIds] },
    recipientPersonId: input.personId, id: input.id } });
}
export type OwnedNotice = NonNullable<Awaited<ReturnType<typeof ownNotice>>>;
export async function markOwnNoticeRead(scope: { eventId: string }, input: {
  tx: PrismaTransactionClient; personId: string; id: string; now: Date;
}) {
  return input.tx.notice.updateMany({ where: { eventId: scope.eventId, id: input.id,
    recipientPersonId: input.personId, readAt: null }, data: { readAt: input.now } });
}
