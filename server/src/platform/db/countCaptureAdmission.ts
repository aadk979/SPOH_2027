import { ERROR_CODES } from '@spoh/shared';
import { ConflictError } from '../errors/index.js';
import { loadResolvedSetting } from '../settings/scopedStore.js';
import { admitCapture, type CaptureAdmissionRequest } from './captureAdmission.js';
import { holdCaptureEvent } from './captureProvenance.js';
import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';
import type { Clock } from '../time/index.js';

/** Count/journey controls do not disable the safety reporting chain. The caller holds the phase lock. */
export async function assertCountCaptureOpen(
  tx: PrismaTransactionClient,
  scope: EventScope,
  stationId?: string,
): Promise<void> {
  const event = await holdCaptureEvent(tx, scope);
  const open = await loadResolvedSetting(
    'capture.open',
    { ...scope, organisationId: event.organisationId, ...(stationId ? { stationId } : {}) },
    tx,
  );
  if (open.value !== true) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Capture is paused for this event or station.');
  }
}

/** Lifecycle admission precedes live count controls, so a station override cannot reopen an event. */
export async function admitCountCapture(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { request?: CaptureAdmissionRequest; clock?: Clock; stationId?: string } = {},
) {
  const admission = await admitCapture(tx, scope, input);
  // Preserve the already validated pre-close offline queue during its receipt grace.
  if (!admission.lateSync) await assertCountCaptureOpen(tx, scope, input.stationId);
  return admission;
}
