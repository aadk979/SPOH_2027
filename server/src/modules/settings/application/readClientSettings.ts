import type { ClientSettingsResponse } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { getSettings } from '../../../platform/settings/index.js';
import { prepareNumericSettings } from '../../../platform/settings/numericSnapshot.js';
import type { SettingKey } from '../../../platform/settings/registry.js';

/** Copied to the event scope and written only through the catalogue (P10.2). */
const SCOPED_KEYS = [
  'captureUndoWindowSeconds',
  'captureSendGraceSeconds',
  'outboxWarningCount',
  'outboxWarningAgeMinutes',
] as const satisfies readonly SettingKey[];

/**
 * A device's tuning for the caller's own event. The capture and outbox keys
 * resolve from the scoped store (event, then the compiled default). The two
 * platform-only poll intervals still come from the legacy store, which remains
 * their only writer until their own migration.
 *
 * The event row is held and the membership rechecked under its lock, so a
 * suspended or removed member cannot read through a stale session. Reads have
 * no audit, history or schedule effects.
 */
export function readClientSettings(actor: ActorContext): Promise<ClientSettingsResponse> {
  return prisma.$transaction(
    async (tx) => {
      await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'own.read',
      });
      const resolve = await prepareNumericSettings(actor.scope, SCOPED_KEYS, tx);
      const legacy = getSettings();
      return {
        settings: {
          dashboardPollSeconds: legacy.dashboardPollSeconds,
          alertPollSeconds: legacy.alertPollSeconds,
          captureUndoWindowSeconds: resolve('captureUndoWindowSeconds'),
          captureSendGraceSeconds: resolve('captureSendGraceSeconds'),
          outboxWarningCount: resolve('outboxWarningCount'),
          outboxWarningAgeMinutes: resolve('outboxWarningAgeMinutes'),
        },
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
