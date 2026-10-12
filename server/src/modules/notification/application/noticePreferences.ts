import { DEFAULT_NOTICE_PREFERENCE, type UpdateNoticePreferenceRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { UnauthenticatedError } from '../../../platform/errors/index.js';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { noticePreference } from '../data/noticeStandingRepo.js';
import { lockNoticePreferenceOwner, noticePreferenceOwner, saveNoticePreference } from '../data/noticePreferenceRepo.js';

export async function readNoticePreference(personId: string) {
  if (!await noticePreferenceOwner(prisma, personId)) throw new UnauthenticatedError();
  const row = await noticePreference(prisma, personId);
  return { data: row ? { urgentPush: row.urgentPush, operationalPush: row.operationalPush,
    updatedAt: row.updatedAt.toISOString() } : DEFAULT_NOTICE_PREFERENCE };
}
export function updateNoticePreference(body: UpdateNoticePreferenceRequest, actor: {
  personId: string; audit: AuditContext; clock?: Clock;
}) {
  return prisma.$transaction(async (tx) => {
    if (!await lockNoticePreferenceOwner(tx, actor.personId)) throw new UnauthenticatedError();
    const old = await noticePreference(tx, actor.personId);
    const before = old ?? DEFAULT_NOTICE_PREFERENCE;
    if (before.urgentPush === body.urgentPush && before.operationalPush === body.operationalPush)
      return { data: { ...body, updatedAt: old?.updatedAt.toISOString() ?? null } };
    const row = await saveNoticePreference(tx, { personId: actor.personId, body,
      now: (actor.clock ?? systemClock).now() });
    await writeAudit(tx, { ...actor.audit, action: 'notification.preference',
      entityType: 'Person', entityId: actor.personId,
      before: { urgentPush: before.urgentPush, operationalPush: before.operationalPush }, after: body });
    return { data: { ...body, updatedAt: row.updatedAt.toISOString() } };
  });
}
