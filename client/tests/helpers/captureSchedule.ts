import {
  GENERATED_SETTING_DEFAULTS,
  scopedOperationalKeys,
  type CaptureScheduleRecord,
  type ScopedSettingsReadResponse,
  type ScopedSettingsTarget,
} from '@spoh/shared';
import { TEST_EVENT } from './event';

export function captureCurrent(
  target: ScopedSettingsTarget = { scope: 'event' },
): ScopedSettingsReadResponse {
  return {
    eventId: TEST_EVENT.id,
    target,
    eventStatus: 'LIVE',
    evaluatedAt: '2027-01-01T03:00:00Z',
    data: scopedOperationalKeys(target.scope).map((key) => ({
      key,
      value: GENERATED_SETTING_DEFAULTS[key],
      storedVersion: 0,
      source: { scope: 'default', version: 0 },
      invalidScopes: [],
    })),
  };
}
export function captureSchedule(
  current = captureCurrent(),
  overrides: Partial<CaptureScheduleRecord> = {},
): CaptureScheduleRecord {
  return {
    id: 'owned-action',
    eventId: current.eventId,
    target: current.target,
    key: 'capture.open',
    value: false,
    expectedVersion: 0,
    reason: 'Reviewed synthetic capture pause',
    kind: 'SETTING',
    recurring: false,
    status: 'PENDING',
    version: 1,
    attempts: 0,
    maxAttempts: 5,
    createdByYou: true,
    createdAt: '2027-01-01T03:00:00Z',
    scheduledFor: '2027-01-01T05:00:00Z',
    runAt: '2027-01-01T05:00:00Z',
    completedAt: null,
    lastError: null,
    ...overrides,
  };
}
