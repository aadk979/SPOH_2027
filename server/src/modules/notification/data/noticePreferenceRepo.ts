import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { UpdateNoticePreferenceRequest } from '@spoh/shared';

export function noticePreferenceOwner(tx: PrismaTransactionClient, personId: string) {
  return tx.person.findFirst({ where: { id: personId, deactivatedAt: null }, select: { id: true } });
}

export async function lockNoticePreferenceOwner(tx: PrismaTransactionClient, personId: string) {
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${personId} FOR UPDATE`;
  return noticePreferenceOwner(tx, personId);
}
export function saveNoticePreference(tx: PrismaTransactionClient, input: {
  personId: string; body: UpdateNoticePreferenceRequest; now: Date;
}) {
  return tx.noticePreference.upsert({ where: { personId: input.personId },
    create: { personId: input.personId, ...input.body, updatedAt: input.now },
    update: { ...input.body, updatedAt: input.now } });
}
