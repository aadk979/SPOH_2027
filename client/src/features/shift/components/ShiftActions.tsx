import type { ReactNode } from 'react';
import type { MeResponse } from '@spoh/shared';
import type { useAttendance } from '@/features/attendance';
import type { useCheckIn, useCheckOut } from '../queries';
import { Button, ButtonLink, StatusText } from '@/shared/ui';
import { useEventTime } from '@/features/session';
export function ShiftActions({
  assignment,
  attendance,
  checkIn,
  checkOut,
  confirmingCheckOut,
  setConfirmingCheckOut,
}: {
  assignment: NonNullable<MeResponse['currentAssignment']>;
  attendance: ReturnType<typeof useAttendance>;
  checkIn: ReturnType<typeof useCheckIn>;
  checkOut: ReturnType<typeof useCheckOut>;
  confirmingCheckOut: boolean;
  setConfirmingCheckOut(value: boolean): void;
}): ReactNode {
  const format = useEventTime();
  return (
    <div className="mt-md flex flex-wrap items-center gap-sm">
      {assignment.checkedInAt === null ? (
        attendance.data?.attendance ? (
          <Button onClick={() => checkIn.mutate()} disabled={checkIn.isPending}>
            Start shift
          </Button>
        ) : (
          <ButtonLink href="/attendance">Submit attendance</ButtonLink>
        )
      ) : assignment.checkedOutAt === null ? (
        <>
          <StatusText tone="ok">
            <span aria-hidden="true">✓ </span>
            Checked in {format.time(assignment.checkedInAt)}
          </StatusText>
          {confirmingCheckOut ? (
            <div className="flex items-center gap-xs">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setConfirmingCheckOut(false);
                  checkOut.mutate(assignment.id);
                }}
                disabled={checkOut.isPending}
              >
                {checkOut.isPending ? 'Ending…' : 'Confirm end shift'}
              </Button>
              <Button variant="quiet" size="sm" onClick={() => setConfirmingCheckOut(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => setConfirmingCheckOut(true)}
              disabled={checkOut.isPending}
            >
              Check out
            </Button>
          )}
        </>
      ) : (
        <StatusText tone="neutral">Shift ended {format.time(assignment.checkedOutAt)}</StatusText>
      )}
      {assignment.checkedInAt !== null ? (
        <ButtonLink href="/attendance" variant="quiet" size="sm">
          Attendance & verification
        </ButtonLink>
      ) : null}
    </div>
  );
}
