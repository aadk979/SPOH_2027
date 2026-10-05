import { useState } from 'react';
import type { ScopedSettingsTarget } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useStations } from '@/features/stations';
import { useEventId } from '@/shared/lib/eventContext';
import { Button, Field, Select } from '@/shared/ui';
import { CaptureControlsContents } from './CaptureControlsContents';

export function CaptureControlsPanel({ enabled }: { enabled: boolean }) {
  const session = useCurrentSession();
  const eventId = useEventId();
  if (!enabled || !session) return null;
  return <CaptureControlsOwner key={`${eventId}:${session.volunteerId}`} />;
}
function CaptureControlsOwner() {
  const stations = useStations();
  const [expanded, setExpanded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [selection, setSelection] = useState('event');
  const target: ScopedSettingsTarget =
    selection === 'event' ? { scope: 'event' } : { scope: 'station', stationId: selection };
  return (
    <div className="flex flex-col gap-md">
      <Button
        variant="secondary"
        className="hover:bg-surface"
        aria-expanded={expanded}
        disabled={locked}
        aria-controls="capture-controls"
        onClick={() => setExpanded(!expanded)}
      >
        Capture controls
      </Button>
      {expanded ? (
        <div id="capture-controls" className="flex flex-col gap-md">
          <Field id="capture-scope" label="Capture scope">
            {(props) => (
              <Select
                {...props}
                disabled={locked}
                value={selection}
                onChange={(event) => setSelection(event.target.value)}
              >
                <option value="event">Event</option>
                {(stations.data ?? []).map(({ id, name }) => (
                  <option key={id} value={id}>
                    Station: {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <CaptureControlsContents key={selection} target={target} onLockChange={setLocked} />
        </div>
      ) : null}
    </div>
  );
}
