import { DEFAULT_NOTICE_PREFERENCE, NOTICE_SOURCE_BY_KIND, NoticeContext,
  type NoticeContext as Context, type NoticeKind, type AnnouncementPriority,
  type NoticeSourceRef } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { archiveNoticeRecipients, noticeHistoryRecipients, noticeRecipients } from '../data/noticeRecipientRepo.js';
import { insertNotice, insertNoticeDevices } from '../data/noticeQueueRepo.js';
import { TTL_SECONDS } from '../domain/delivery.js';
import { deliveryDeadline, preferenceAllows, pushKind } from '../domain/noticeDelivery.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../platform/http/auditContext.js';

export interface QueueNoticesInput {
  kind: NoticeKind; priority: AnnouncementPriority; source: NoticeSourceRef;
  transitionKey: string; context: Context; recipientPersonIds: readonly string[];
  createdAt: Date; expiresAt?: Date | null;
}

async function recipients(scope: EventScope, input: { tx: PrismaTransactionClient; notice: QueueNoticesInput }) {
  const personIds = [...new Set(input.notice.recipientPersonIds)];
  if (input.notice.kind === 'ARCHIVE_REMINDER') {
    return (await archiveNoticeRecipients(scope, { tx: input.tx, personIds })).map((person) => ({
      personId: person.id, membershipId: person.eventMemberships[0]?.id ?? null,
      active: true, preference: person.noticePreference, devices: person.pushSubscriptions,
    }));
  }
  return (await noticeRecipients(scope, { tx: input.tx, personIds })).map((member) => ({
    personId: member.personId, membershipId: member.id, active: member.status === 'ACTIVE',
    preference: member.person.noticePreference, devices: member.person.pushSubscriptions,
  }));
}

function validateNotice(input: QueueNoticesInput) {
  const contextType = { ANNOUNCEMENT: 'announcement', LOST_PERSON: 'lost-person', ASSIGNMENT: 'assignment',
    SWAP: 'swap', FALLBACK: 'fallback', EVENT: 'event', INCIDENT: 'incident', GIFT: 'gift' } as const;
  if (NOTICE_SOURCE_BY_KIND[input.kind] !== input.source.kind || !input.transitionKey.length
    || input.context.type !== contextType[input.source.kind]
    || input.transitionKey.length > 240) throw new ValidationError('Invalid notification source transition.');
  return { ...input, context: NoticeContext.parse(input.context) };
}

/** The source transaction owns the transition. This producer only stores committed work. */
export async function queueNotices(tx: PrismaTransactionClient, scope: EventScope, input: QueueNoticesInput) {
  const notice = validateNotice(input);
  const kind = pushKind(notice.kind, notice.priority);
  let created = 0;
  for (const recipient of await recipients(scope, { tx, notice })) {
    const row = await insertNotice(scope, { tx, record: notice, ...recipient });
    if (!row) continue;
    created += 1;
    if (!kind || !recipient.active || !preferenceAllows(notice.priority,
      recipient.preference ?? DEFAULT_NOTICE_PREFERENCE)) continue;
    const expiresAt = deliveryDeadline({ ...notice, ttlSeconds: TTL_SECONDS[kind] });
    if (expiresAt <= notice.createdAt) continue;
    await insertNoticeDevices(scope, { tx, noticeId: row.id, personId: recipient.personId,
      membershipId: recipient.membershipId, deviceIds: recipient.devices.map((device) => device.id),
      createdAt: notice.createdAt, expiresAt });
  }
  return { created };
}

/** Compatibility creates centre history only; it never sends historical device alerts again. */
export async function materialiseNotices(tx: PrismaTransactionClient, scope: EventScope, input: QueueNoticesInput) {
  const notice = validateNotice(input);
  let created = 0;
  for (const recipient of await noticeHistoryRecipients(scope, { tx, personIds: notice.recipientPersonIds })) {
    if (await insertNotice(scope, { tx, record: notice, personId: recipient.personId,
      membershipId: recipient.id })) created += 1;
  }
  if (created) await writeAudit(tx, { ...SYSTEM_AUDIT_CONTEXT, eventId: scope.eventId,
    action: 'notification.materialise', entityType: 'Notice', entityId: null,
    after: { sourceKind: notice.source.kind, sourceId: notice.source.id, recipients: created } });
  return { created };
}
