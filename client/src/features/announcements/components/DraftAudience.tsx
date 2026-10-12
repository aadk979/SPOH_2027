import type { MeResponse } from '@spoh/shared';
import { Checkbox, Field, Select, ControlHelp } from '@/shared/ui';
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
      <ControlHelp>Saving keeps this audience in your private draft. Publication uses that saved audience; whole event must be chosen explicitly.</ControlHelp>
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
        <Field id="draft-station" label="Draft audience" hint="Choose a station, or use your current posting. No current posting means a station must be selected." error={form.errors.stationId}>
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
      <p role="status" className="text-caption text-text-muted">Draft audience: {form.eventWide ? 'Whole event' : form.stationId ? form.stations.data?.find((station) => station.id === form.stationId)?.name ?? 'Selected station' : me.currentAssignment?.station.name ?? 'Choose a station before saving'}</p>
    </>
  );
}
