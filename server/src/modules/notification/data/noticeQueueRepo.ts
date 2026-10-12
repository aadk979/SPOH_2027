import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { AnnouncementPriority, NoticeContext, NoticeKind, NoticeSourceRef } from '@spoh/shared';

export interface NoticeQueueRecord {
  kind: NoticeKind; priority: AnnouncementPriority; source: NoticeSourceRef;
  transitionKey: string; context: NoticeContext; createdAt: Date; expiresAt?: Date | null;
}
export async function insertNotice(scope: EventScope, input: {
  tx: PrismaTransactionClient; record: NoticeQueueRecord;
  personId: string; membershipId: string | null;
}) {
  const { record, tx } = input;
  const rows = await tx.notice.createManyAndReturn({ data: { eventId: scope.eventId,
    recipientPersonId: input.personId, recipientMembershipId: input.membershipId,
    kind: record.kind, priority: record.priority, sourceKind: record.source.kind,
    sourceId: record.source.id, transitionKey: record.transitionKey, context: record.context,
    createdAt: record.createdAt, expiresAt: record.expiresAt ?? null,
  }, skipDuplicates: true, select: { id: true } });
  return rows[0] ?? null;
}

export function insertNoticeDevices(scope: EventScope, input: {
  tx: PrismaTransactionClient; noticeId: string; personId: string; membershipId: string | null;
  deviceIds: readonly string[]; createdAt: Date; expiresAt: Date;
}) {
  return input.tx.noticeDelivery.createMany({ data: input.deviceIds.map((subscriptionId) => ({
    eventId: scope.eventId, noticeId: input.noticeId, recipientPersonId: input.personId,
    membershipId: input.membershipId, subscriptionId, deviceKey: subscriptionId,
    createdAt: input.createdAt, runAt: input.createdAt, expiresAt: input.expiresAt,
  })), skipDuplicates: true });
}
