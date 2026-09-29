import type { ReactNode } from 'react';
import type { FallbackController } from '../hooks/useFallbackScreen';
import { Field, Select } from '@/shared/ui';
export function FallbackScopeField({ controller }: { controller: FallbackController }): ReactNode {
  const { stationId, setStationId, stations } = controller;
  return (
    <Field id="scope" label="Scope" error={controller.errors.stationId}>
      {(props) => (
        <Select {...props} value={stationId} onChange={(event) => setStationId(event.target.value)}>
          <option value="">Event-wide</option>
          {(stations.data ?? []).map((station) => (
            <option key={station.id} value={station.id}>
              {station.name} only
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
