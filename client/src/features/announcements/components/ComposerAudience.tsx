import type { ReactNode } from 'react';
import type { MeResponse } from '@spoh/shared';
import type { useComposer } from '../hooks/useComposer';
import { Checkbox, Field, Select, ControlHelp } from '@/shared/ui';
function audienceLabel(form: ReturnType<typeof useComposer>, me: MeResponse | undefined): string {
  if (form.eventWide) return 'Whole event';
  if (form.stationId) return form.stations.data?.find((station) => station.id === form.stationId)?.name ?? 'Selected station';
  return me?.currentAssignment?.station.name ?? 'Choose a station before sending';
}
export function ComposerAudience({
  form,
  me,
}: {
  form: ReturnType<typeof useComposer>;
  me: MeResponse | undefined;
}): ReactNode {
  const {
    requiresAck,
    setRequiresAck,
    eventWide,
    setEventWide,
    canSendEventWide,
    stationId,
    setStationId,
    stations,
  } = form;
  return (
    <>
      <ControlHelp>Choose the audience deliberately. A station selection sends only to that station; whole event sends to every eligible event member. Without a current station, choose one before sending.</ControlHelp>
      <div className="flex flex-col">
        <Checkbox
          label="Ask for acknowledgement"
          checked={requiresAck}
          onChange={(event) => setRequiresAck(event.target.checked)}
        />

        {canSendEventWide ? (
          <Checkbox
            label="Send to the whole event"
            checked={eventWide}
            onChange={(event) => setEventWide(event.target.checked)}
          />
        ) : null}
      </div>
      {!eventWide ? (
        <Field id="announcement-station" label="Send to" hint="An empty selection uses your current posted station only. It never means the whole event." error={form.errors.stationId}>
          {(props) => (
            <Select
              {...props}
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
            >
              <option value="">
                {me?.currentAssignment
                  ? `My station (${me.currentAssignment.station.name})`
                  : 'Choose a station…'}
              </option>
              {(stations.data ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <p role="status" className="text-caption text-text-muted">Audience: {audienceLabel(form, me)}</p>
    </>
  );
}
