import type { ReactNode } from 'react';
import type { MeResponse } from '@spoh/shared';
import type { useComposer } from '../hooks/useComposer';
import { Checkbox, Field, Select } from '@/shared/ui';
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
      {' '}
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
        <Field id="announcement-station" label="Send to">
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
    </>
  );
}
