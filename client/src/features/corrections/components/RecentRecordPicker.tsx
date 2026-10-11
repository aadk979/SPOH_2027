import { useState } from 'react';
import type { RegistrationRecord, FootfallTickRecord } from '@spoh/shared';
import { useStations } from '@/features/stations';
import { useEventTime } from '@/features/session';
import { Button, Callout, Field, Select } from '@/shared/ui';
import { useRecentCorrectionRecords } from '../queries';

export function RecentRecordPicker({
  kind,
  onChoose,
}: {
  kind: 'registration' | 'footfall';
  onChoose(id: string): void;
}) {
  const [stationId, setStationId] = useState('');
  const stations = useStations();
  const time = useEventTime();
  const records = useRecentCorrectionRecords(kind, stationId);
  return (
    <>
      <Field id="correction-station" label="Find a recent record at">
        {(props) => (
          <Select
            {...props}
            value={stationId}
            onChange={(event) => setStationId(event.target.value)}
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
      {records.data?.pages
        .flatMap<RegistrationRecord | FootfallTickRecord>((page) => page.data)
        .map((record) => (
          <Button key={record.id} variant="quiet" onClick={() => onChoose(record.id)}>
            {time.dateTime(record.recordedAt)} ·{' '}
            {'categoryLabel' in record ? record.categoryLabel : `${record.quantity} room entries`} ·{' '}
            {record.source}
          </Button>
        ))}
      {records.error ? (
        <Callout tone="alert" role="alert">
          {records.error.message}
        </Callout>
      ) : null}
      {records.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={records.isFetchingNextPage}
          onClick={() => void records.fetchNextPage()}
        >
          Load older counting records
        </Button>
      ) : null}
    </>
  );
}
