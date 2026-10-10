import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { resolvedAlertsPurged } from '../../lostPerson/index.js';
import { archiveExportReady, finalReportReady } from '../../report/index.js';
import { archiveCloseoutFacts } from '../data/archiveCloseoutRepo.js';
import type { LifecycleEvent } from '../data/lifecycleRepo.js';
import { archiveGraceElapsed } from '../domain/archiveGrace.js';

/** Server evidence only; the caller holds the lifecycle event lock before reading inputs. */
export async function archiveReadiness(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { event: LifecycleEvent; now: Date },
) {
  const { event, now } = input;
  if (event.status !== 'CLOSED') {
    return {
      lostPersonPurgeComplete: false,
      finalReportExists: false,
      captureGracePeriodComplete: false,
      lostFoundClosed: false,
      fallbackWindowsClosed: false,
      exportPackExists: false,
    };
  }
  const grace = await loadResolvedSetting(
    'capture.lateSyncHours',
    { ...scope, organisationId: event.organisationId },
    tx,
  );
  return {
    ...(await archiveCloseoutFacts(scope, tx)),
    lostPersonPurgeComplete: await resolvedAlertsPurged(tx, scope),
    finalReportExists: await finalReportReady(tx, scope, event.lifecycleVersion),
    exportPackExists: await archiveExportReady(tx, scope, event.lifecycleVersion),
    captureGracePeriodComplete: archiveGraceElapsed({
      closedAt: event.closedAt,
      now,
      graceHours: Number(grace.value),
    }),
  };
}
