import type { PrismaTransactionClient } from '../../../platform/db/client.js';
export async function urgentPushPreference(tx: PrismaTransactionClient, personId: string) {
  const preference = await tx.noticePreference.findUnique({ where: { personId }, select: { urgentPush: true } });
  return preference?.urgentPush ?? true;
}
