import type { MeResponse } from '@spoh/shared';
import { Checkbox, Field, Select } from '@/shared/ui';
import type { useDraftEditor } from '../hooks/useDraftEditor';

export function DraftAudience({
  form,
  me,
}: {
  form: ReturnType<typeof useDraftEditor>;
  me: MeResponse;
}) {
  return (
    <>
      <Checkbox
        label="Ask for acknowledgement when published"
        checked={form.requiresAck}
        onChange={(event) => form.setRequiresAck(event.target.checked)}
      />
      {form.canSendEventWide ? (
        <Checkbox
          label="Address the whole event"
          checked={form.eventWide}
          onChange={(event) => form.setEventWide(event.target.checked)}
        />
      ) : null}
      {!form.eventWide ? (
        <Field id="draft-station" label="Draft audience" error={form.errors.stationId}>
          {(props) => (
            <Select
              {...props}
              value={form.stationId}
              onChange={(event) => form.setStationId(event.target.value)}
            >
              <option value="">
                {me.currentAssignment
                  ? `My station (${me.currentAssignment.station.name})`
                  : 'Choose a station…'}
              </option>
              {(form.stations.data ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </>
  );
}
