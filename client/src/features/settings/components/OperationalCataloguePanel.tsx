import { useState } from 'react';
import type { ScopedSettingsTarget } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useStations } from '@/features/stations';
import { useEventId } from '@/shared/lib/eventContext';
import { Button, Field, Select } from '@/shared/ui';
import { OperationalCatalogueContents } from './OperationalCatalogueContents';

export function OperationalCataloguePanel({ enabled }: { enabled: boolean }) {
  const session = useCurrentSession();
  const eventId = useEventId();
  if (!enabled || !session) return null;
  return <OperationalCatalogueOwner key={`${eventId}:${session.volunteerId}`} />;
}
function OperationalCatalogueOwner() {
  const [expanded, setExpanded] = useState(false);
  const [locked, setLocked] = useState(false);
  return (
    <div className="flex flex-col gap-md">
      <Button
        variant="secondary"
        disabled={locked}
        aria-expanded={expanded}
        aria-controls="operational-catalogue"
        onClick={() => setExpanded(!expanded)}
      >
        Settings catalogue
      </Button>
      {expanded ? <OperationalCatalogueScope locked={locked} onLockChange={setLocked} /> : null}
    </div>
  );
}
function OperationalCatalogueScope(input: {
  locked: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const stations = useStations();
  const [selection, setSelection] = useState('event');
  const target: ScopedSettingsTarget =
    selection === 'event' ? { scope: 'event' } : { scope: 'station', stationId: selection };
  return (
    <div id="operational-catalogue" className="flex flex-col gap-md">
      <p>Registered settings at this scope, including inherited values and recorded changes.</p>
      <Field id="catalogue-scope" label="Catalogue scope">
        {(props) => (
          <Select
            {...props}
            disabled={input.locked}
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
      {stations.isError ? <p>Stations are unavailable. Event settings remain available.</p> : null}
      <OperationalCatalogueContents
        key={selection}
        target={target}
        onLockChange={input.onLockChange}
        locked={input.locked}
      />
    </div>
  );
}
