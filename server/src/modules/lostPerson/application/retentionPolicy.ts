import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { SETTINGS } from '../../../platform/settings/registry.js';
import {
  loadResolvedSetting,
  type SettingContext,
} from '../../../platform/settings/scopedStore.js';

/**
 * The event's own retention, or the 24 hours promised to families (D-16). The
 * legacy global row was copied to the event scope and is no longer read; an
 * invalid stored value falls through to the default.
 */
export async function lostPersonRetentionHours(
  tx: PrismaTransactionClient,
  context: SettingContext,
): Promise<number> {
  const resolved = await loadResolvedSetting('lostPersonPurgeHours', context, tx);
  return SETTINGS.lostPersonPurgeHours.schema.parse(resolved.value);
}
