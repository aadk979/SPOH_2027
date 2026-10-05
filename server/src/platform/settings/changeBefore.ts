import { holdCaptureEvent } from '../db/captureProvenance.js';
import type { PrismaTransactionClient } from '../db/client.js';
import type { SettingKey } from './registry.js';
import { loadResolvedSetting, type SettingTarget } from './scopedStore.js';

/** An absent selected override inherits a value; it need not equal the compiled default. */
export async function settingChangeBefore(
  tx: PrismaTransactionClient,
  input: {
    target: SettingTarget;
    key: SettingKey;
    stored: { value: unknown } | null;
  },
): Promise<unknown> {
  if (input.stored) return input.stored.value;
  const { target } = input;
  const context =
    target.scope === 'platform'
      ? { organisationId: target.organisationId }
      : {
          organisationId: (await holdCaptureEvent(tx, target)).organisationId,
          eventId: target.eventId,
          ...(target.scope === 'station' ? { stationId: target.stationId } : {}),
        };
  return (await loadResolvedSetting(input.key, context, tx)).value;
}
