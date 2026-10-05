import type { ScopedSettingsTarget } from '@spoh/shared';

export function assertCaptureTarget(
  eventId: string,
  target: ScopedSettingsTarget,
  result: { eventId: string; target: ScopedSettingsTarget },
) {
  if (
    result.eventId !== eventId ||
    result.target.scope !== target.scope ||
    (target.scope === 'station' &&
      (result.target.scope !== 'station' || result.target.stationId !== target.stationId))
  )
    throw new Error('Capture schedule event or scope mismatch');
}
