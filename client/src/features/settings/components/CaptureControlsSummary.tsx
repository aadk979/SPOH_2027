import type { ScopedSettingsReadResponse } from '@spoh/shared';
import { useEventTime } from '@/features/session';
import { Button, Callout } from '@/shared/ui';
import { captureMetadata, captureRow, captureSource, captureValue } from '../model/captureControl';

export function CaptureControlsSummary(input: {
  current: ScopedSettingsReadResponse;
  readUnavailable: boolean;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
}) {
  const clock = useEventTime();
  const row = captureRow(input.current);
  return (
    <>
      <p className="text-section">{captureMetadata.label}</p>
      <p>{captureMetadata.description}</p>
      <p>
        {input.current.target.scope === 'event'
          ? 'Station overrides take precedence over the event value.'
          : 'This control affects only the selected station.'}
      </p>
      <p>Effective capture: {captureValue(row.value)}</p>
      <p>{captureSource(row, input.current.target.scope)}</p>
      <p className="text-caption text-ink-muted">
        Selected scope version {row.storedVersion} · Checked{' '}
        {clock.dateTime(input.current.evaluatedAt)}
      </p>
      <Callout>
        Pausing prevents new count and journey captures at this scope. Safety reports remain
        available. The event schedule and lifecycle still apply when capture is open.
      </Callout>
      {row.invalidScopes.length ? (
        <Callout tone="alert">
          A stored setting is invalid. Review the effective value before replacing or removing this
          override.
        </Callout>
      ) : null}
      {input.current.eventStatus === 'ARCHIVED' ? (
        <Callout>Archived event settings are read only.</Callout>
      ) : null}
      {input.readUnavailable ? (
        <Callout tone="alert" role="alert">
          Current capture settings are unavailable. Reload before making a new change.
          <Button
            variant="quiet"
            onClick={() => {
              void input.loadCurrent();
            }}
          >
            Reload capture settings
          </Button>
        </Callout>
      ) : null}
    </>
  );
}
