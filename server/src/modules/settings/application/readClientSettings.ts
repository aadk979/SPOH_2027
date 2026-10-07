import type { ClientSettingsResponse } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { prepareNumericSettings } from '../../../platform/settings/numericSnapshot.js';
import type { SettingKey } from '../../../platform/settings/registry.js';

/**
 * The capture and outbox keys (event scope, written through the catalogue) and
 * the two poll intervals (organisation scope, written by platform admins, D-17).
 */
const SCOPED_KEYS = [
  'dashboardPollSeconds',
  'alertPollSeconds',
  'captureUndoWindowSeconds',
  'captureSendGraceSeconds',
  'outboxWarningCount',
  'outboxWarningAgeMinutes',
] as const satisfies readonly SettingKey[];

/**
 * A device's tuning for the caller's own event, all from the scoped store in one
 * query: the capture and outbox keys from the event, the poll intervals from its
 * organisation, each falling back to the compiled default.
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
      return {
        settings: {
          dashboardPollSeconds: resolve('dashboardPollSeconds'),
          alertPollSeconds: resolve('alertPollSeconds'),
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
