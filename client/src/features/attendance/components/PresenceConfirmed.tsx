import type { ReactNode } from 'react';
import type { AttendanceData } from '../hooks/useAttendanceScreen';
import { Card, ButtonLink } from '@/shared/ui';
import { useEventTime } from '@/features/session';
export function PresenceConfirmed({
  present,
}: {
  present: NonNullable<AttendanceData['attendance']>;
}): ReactNode {
  const format = useEventTime();
  return (
    <Card>
      <p className="font-semibold">You are marked present</p>
      <p className="mt-xs text-text-muted">
        {format.time(present.presentAt)} ·{' '}
        {present.method === 'ROOT'
          ? 'Root admin opened attendance'
          : `${present.verifiedByName ?? 'Verifier'} · ${present.method === 'PIN' ? 'Secondary PIN' : 'QR scan'}`}
      </p>
      <ButtonLink className="mt-md" variant="secondary" href="/home">
        Back to home
      </ButtonLink>
    </Card>
  );
}
