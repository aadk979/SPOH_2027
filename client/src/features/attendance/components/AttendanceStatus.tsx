import type { ReactNode } from 'react';
import type { AttendanceController } from '../hooks/useAttendanceScreen';
import { Button, Callout } from '@/shared/ui';
export function AttendanceStatus({ controller }: { controller: AttendanceController }): ReactNode {
  const { status, submit, start, issue } = controller;
  const data = status.data;
  const error = submit.error ?? start.error ?? issue.error;
  return (
    <>
      {' '}
      {status.isPending ? <Callout>Loading attendance…</Callout> : null}
      {status.isError ? (
        <Callout tone="alert">
          Could not load attendance. Check your connection.{' '}
          <Button variant="quiet" onClick={() => void status.refetch()}>
            Try again
          </Button>
        </Callout>
      ) : null}
      {data && !data.configured ? (
        <Callout tone="alert">
          The root attendance admin has not been configured yet. Contact the event administrator.
        </Callout>
      ) : null}
      {data && !data.eventDay ? (
        <Callout>Attendance opens on configured event days.</Callout>
      ) : null}
      {error ? (
        <Callout tone="alert" role="alert">
          {error.message}
        </Callout>
      ) : null}
    </>
  );
}
