import { useStations } from '@/features/stations';
import { Field, Input, Select } from '@/shared/ui';
import type { useBulkFootfallForm } from '../hooks/useBulkFootfallForm';

export function BulkFootfallFields({
  control,
}: {
  control: ReturnType<typeof useBulkFootfallForm>;
}) {
  const stations = useStations();
  const { form } = control;
  return (
    <>
      <Field id="bulk-station" label="Room or station" error={form.errors.stationId}>
        {(props) => (
          <Select
            {...props}
            value={form.values.stationId}
            onChange={(event) => form.setField('stationId', event.target.value)}
          >
            <option value="">Choose a station</option>
            {stations.data?.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="bulk-count" label="Room entries" error={form.errors.quantity}>
        {(props) => (
          <Input
            {...props}
            type="number"
            min={1}
            max={5000}
            value={form.values.quantity}
            onChange={(event) => form.setField('quantity', event.target.value)}
          />
        )}
      </Field>
      <Field
        id="bulk-block"
        label={`Block start (${control.timezone})`}
        error={form.errors.wallTime}
      >
        {(props) => (
          <Input
            {...props}
            type="datetime-local"
            value={form.values.wallTime}
            onChange={(event) => form.setField('wallTime', event.target.value)}
          />
        )}
      </Field>
      <Field id="bulk-source" label="Source" error={form.errors.source}>
        {(props) => (
          <Select
            {...props}
            value={form.values.source}
            onChange={(event) =>
              form.setField('source', event.target.value as typeof form.values.source)
            }
          >
            <option value="PAPER">Paper clicker</option>
            <option value="FALLBACK_SHEET">Fallback sheet</option>
            <option value="MANUAL_ADJUSTMENT">Manual adjustment</option>
          </Select>
        )}
      </Field>
    </>
  );
}
