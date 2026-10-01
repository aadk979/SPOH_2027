import {
  ERROR_CODES,
  type ChangeEventSettingRequest,
  type EventSettings,
  type EventStatus,
} from '@spoh/shared';
import { ConflictError } from '../../../platform/errors/index.js';

/** The states before the event runs: the only ones visitor data may be switched on in. */
const BEFORE_LIVE: readonly EventStatus[] = ['DRAFT', 'READY', 'REHEARSAL'];

export function assertUnlocked(
  setting: { label: string; lockedIn: readonly EventStatus[] },
  status: EventStatus,
): void {
  if (setting.lockedIn.includes(status)) {
    throw new ConflictError(
      ERROR_CODES.SETTING_LOCKED,
      `${setting.label} cannot change while the event is ${status.toLowerCase()}.`,
    );
  }
}

function changedMeanwhile(): ConflictError {
  return new ConflictError(
    ERROR_CODES.SETTING_VERSION_CONFLICT,
    'Someone changed this setting since you opened it. Reload and decide again.',
  );
}

/** A change must be made to the version the caller saw (ADR-003 §2). */
export function assertReadVersion(stored: number, expected: number): void {
  if (stored !== expected) throw changedMeanwhile();
}

/** The conditional write found a newer version: the same conflict, caught late. */
export function assertWritten(written: boolean): void {
  if (!written) throw changedMeanwhile();
}

/**
 * Visitor personal data can be switched on only before the event runs, so
 * nobody's data starts being collected mid-event (ADR-002 §4).
 */
export function assertVisitorDataChange(
  change: ChangeEventSettingRequest,
  current: EventSettings,
  status: EventStatus,
): void {
  if (change.key !== 'product.visitorDataMode') return;
  const turningOn = current['product.visitorDataMode'] === 'none' && change.value === 'allowlist';
  if (turningOn && !BEFORE_LIVE.includes(status)) {
    throw new ConflictError(
      ERROR_CODES.SETTING_LOCKED,
      'Visitor personal data can only be switched on before the event goes live.',
    );
  }
}
