import type { ScopedOperationalSettingKey, ScopedSettingsTarget } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const SELECT = {
  id: true,
  key: true,
  version: true,
  source: true,
  actorPersonId: true,
  after: true,
  reason: true,
} satisfies Prisma.SettingChangeSelect;
type Target = { key: ScopedOperationalSettingKey; target: ScopedSettingsTarget };
const owned = (scope: EventScope, input: Target) => ({
  eventId: scope.eventId,
  scope: input.target.scope === 'event' ? ('EVENT' as const) : ('STATION' as const),
  scopeId: input.target.scope === 'event' ? scope.eventId : input.target.stationId,
  key: input.key,
});
export function scopedMutationById(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: Target & { historyId: string },
) {
  return tx.settingChange.findFirst({
    where: { ...owned(scope, input), id: input.historyId },
    select: SELECT,
  });
}
export function scopedMutationByVersion(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: Target & { version: number },
) {
  return tx.settingChange.findFirst({
    where: { ...owned(scope, input), version: input.version },
    select: SELECT,
  });
}
/** Keep the selected owned station present through the write, after Event/member locks. */
export async function holdScopedMutationStation(
  tx: PrismaTransactionClient,
  scope: EventScope,
  stationId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Station" WHERE "eventId" = ${scope.eventId} AND id = ${stationId} FOR SHARE`;
  return rows.length === 1;
}
