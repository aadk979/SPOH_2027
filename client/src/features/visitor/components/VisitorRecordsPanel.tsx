import { useCallback, useEffect, useState } from 'react';
import { Button, Callout, LoadingRows } from '@/shared/ui';
import { useAllows, useCurrentSession, useEventTime } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { ApiError } from '@/shared/lib/apiErrors';
import { useVisitorRecords } from '../queries';
export function VisitorRecordsPanel() {
  const session = useCurrentSession();
  const eventId = useEventId();
  const allowed = useAllows()('Self.Read');
  return session && allowed ? (
    <VisitorRecordsOwner key={`${eventId}:${session.volunteerId}:${session.role}`} />
  ) : null;
}
function VisitorRecordsOwner() {
  const [opened, open] = useState(false);
  const [denied, setDenied] = useState<Error | null>(null);
  const onAccessLost = useCallback((error: Error) => setDenied(error), []);
  const toggle = () => {
    setDenied(null);
    open(!opened);
  };
  return (
    <section>
      <h3>Declared visitor values</h3>
      <p>
        The server returns only fields your role may read. Values are separate from counts and
        expire under each field's retention rule.
      </p>
      <Button variant="secondary" onClick={toggle}>
        {opened ? 'Hide visitor values' : 'Read permitted visitor values'}
      </Button>
      {denied ? <Callout role="alert">{denied.message}</Callout> : null}
      {opened && !denied ? <VisitorValues onAccessLost={onAccessLost} /> : null}
    </section>
  );
}
function VisitorValues({ onAccessLost }: { onAccessLost: (error: Error) => void }) {
  const time = useEventTime();
  const records = useVisitorRecords(true);
  useEffect(() => {
    if (records.error instanceof ApiError && [401, 403, 404].includes(records.error.status))
      onAccessLost(records.error);
  }, [records.error, onAccessLost]);
  if (records.isError) return <Callout role="alert">{records.error.message}</Callout>;
  return (
    <>
      {records.isPending ? <LoadingRows /> : null}
      {records.data?.data.length === 0 ? <p>No retained visitor values in this event.</p> : null}
      {records.data?.data.map((record) => (
        <dl key={record.registrationId}>
          <dt>Recorded</dt>
          <dd>
            {time.dateTime(record.recordedAt)}
            {record.rehearsal ? ' · rehearsal' : ''}
          </dd>
          {records.data.fields.map((field) => (
            <div key={field.code}>
              <dt>{field.label}</dt>
              <dd>{record.values[field.code] ?? 'Not provided'}</dd>
            </div>
          ))}
        </dl>
      ))}
    </>
  );
}
