import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { SETTINGS } from '../../../platform/settings/registry.js';
import {
  loadResolvedSetting,
  type SettingContext,
} from '../../../platform/settings/scopedStore.js';

/** An event's current override wins; the legacy global policy is preserved until its migration. */
export async function lostPersonRetentionHours(
  tx: PrismaTransactionClient,
  context: SettingContext,
): Promise<number> {
  const definition = SETTINGS.lostPersonPurgeHours;
  const resolved = await loadResolvedSetting('lostPersonPurgeHours', context, tx);
  if (resolved.source !== 'default') return definition.schema.parse(resolved.value);
  const legacy = await tx.appSetting.findUnique({
    where: { key: 'lostPersonPurgeHours' },
    select: { value: true },
  });
  const parsed = definition.schema.safeParse(legacy?.value ?? definition.default);
  return parsed.success ? parsed.data : definition.default;
}
