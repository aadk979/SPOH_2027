import type { ReactNode } from 'react';
import type { AttendanceController } from '../hooks/useAttendanceScreen';
import { Card, Button } from '@/shared/ui';
export function RootStart({ start }: Pick<AttendanceController, 'start'>): ReactNode {
  return (
    <Card>
      <p>
        Open attendance when you are physically at the event. Excos can then scan your QR or enter
        your secondary PIN.
      </p>
      <Button className="mt-md" onClick={() => start.mutate()} disabled={start.isPending}>
        I am at the event — open attendance
      </Button>
    </Card>
  );
}
