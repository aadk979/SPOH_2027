import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { CloneTarget } from './cloneRepo.js';
import { Prisma } from '../../../generated/prisma/client.js';

/** Copy values with fresh history; never carry schedules or reviewed readiness evidence. */
export async function copyEventSettings(
  tx: PrismaTransactionClient,
  target: CloneTarget,
  sourceEventId: string,
): Promise<void> {
  const settings = await tx.setting.findMany({
    where: { eventId: sourceEventId, scope: { in: ['EVENT', 'STATION'] } },
  });
  for (const setting of settings) {
    const scopeId = setting.scope === 'EVENT' ? target.eventId : target.ids.get(setting.scopeId);
    if (!scopeId) continue;
    const value =
      setting.value === null ? Prisma.JsonNull : (setting.value as Prisma.InputJsonValue);
    await tx.setting.create({
      data: {
        eventId: target.eventId,
        scope: setting.scope,
        scopeId,
        key: setting.key,
        value,
        version: 1,
      },
    });
    await tx.settingChange.create({
      data: {
        eventId: target.eventId,
        scope: setting.scope,
        scopeId,
        key: setting.key,
        version: 1,
        after: value,
        source: 'CLONE',
        reason: 'Copied into a new draft event',
      },
    });
  }
}
