import { ERROR_CODES, type EventStatus } from '@spoh/shared';
import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';
import { assertCaptureMode, holdCaptureEvent } from './captureProvenance.js';
import { ConflictError } from '../errors/index.js';
import { loadResolvedSetting } from '../settings/scopedStore.js';
import { systemClock, type Clock } from '../time/index.js';

export interface CaptureAdmissionRequest {
  rehearsal?: boolean;
  clientRecordedAt?: string;
}

interface CaptureTimeInput {
  status: EventStatus;
  closedAt: Date | null;
  now: Date;
  clientRecordedAt?: string;
  graceHours: number;
}

/** The close exception is bounded by receipt time and a strictly pre-close device timestamp. */
export function admittedCaptureTime(input: CaptureTimeInput): Date {
  if (input.status === 'LIVE' || input.status === 'REHEARSAL') return input.now;
  if (input.status !== 'CLOSED') {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      `Capture is closed while the event is ${input.status}.`,
    );
  }
  return preCloseCaptureTime(input);
}

function preCloseCaptureTime(input: CaptureTimeInput): Date {
  const recorded = input.clientRecordedAt ? new Date(input.clientRecordedAt) : null;
  const elapsed = input.closedAt ? input.now.getTime() - input.closedAt.getTime() : NaN;
  if (
    !recorded ||
    !Number.isFinite(recorded.getTime()) ||
    !input.closedAt ||
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    elapsed > input.graceHours * 3600_000 ||
    recorded.getTime() >= input.closedAt.getTime()
  ) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'This event is closed. Only captures recorded before close may sync during the grace period.',
    );
  }
  return recorded;
}

/** Admission and provenance share the event lock with lifecycle writes. */
export async function admitCapture(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { request?: CaptureAdmissionRequest; clock?: Clock } = {},
) {
  const event = await holdCaptureEvent(tx, scope);
  const rehearsal = event.status === 'REHEARSAL';
  assertCaptureMode(rehearsal, input.request);
  const now = (input.clock ?? systemClock).now();
  const graceHours =
    event.status === 'CLOSED'
      ? Number(
          (
            await loadResolvedSetting(
              'capture.lateSyncHours',
              { ...scope, organisationId: event.organisationId },
              tx,
            )
          ).value,
        )
      : 0;
  const shiftAt = admittedCaptureTime({
    ...event,
    now,
    graceHours,
    clientRecordedAt: input.request?.clientRecordedAt,
  });
  return {
    rehearsal,
    shiftAt,
    ...(event.status === 'CLOSED'
      ? {
          lateSync: {
            clientRecordedAt: shiftAt.toISOString(),
            closedAt: event.closedAt!.toISOString(),
            receivedAt: now.toISOString(),
            graceHours,
          },
        }
      : {}),
  };
}
