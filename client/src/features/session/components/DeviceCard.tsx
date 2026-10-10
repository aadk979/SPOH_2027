import { useState, type ReactNode } from 'react';
import type { SessionSummary } from '@spoh/shared';
import { Button, Callout, Card } from '@/shared/ui';
import { useEventTime } from '../useEventTime';
import { useRevokeDevice } from '../queries';

export function DeviceCard({ device }: { device: SessionSummary }): ReactNode {
  const [reviewing, setReviewing] = useState(false);
  const revoke = useRevokeDevice();
  const time = useEventTime();
  return (
    <Card variant="flat" className="flex flex-col gap-sm">
      <h2 className="font-semibold">{device.current ? 'This device' : 'Signed-in device'}</h2>
      <p className="break-words text-caption text-text-muted">
        {device.userAgent ?? 'Unknown browser'}
      </p>
      <p className="text-caption">Signed in {time.dateTime(device.issuedAt)}</p>
      <p className="text-caption">
        Last used {time.dateTime(device.lastUsedAt ?? device.issuedAt)}
      </p>
      {reviewing ? (
        <>
          <Callout tone="warn">
            {device.current
              ? 'This signs you out here. Captures waiting on this phone stay on this phone.'
              : 'That device must sign in again before it can send more captures.'}
          </Callout>
          <div className="flex gap-sm">
            <Button
              variant="danger"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(device)}
            >
              {revoke.isPending ? 'Signing out…' : 'Confirm sign out'}
            </Button>
            <Button variant="quiet" disabled={revoke.isPending} onClick={() => setReviewing(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setReviewing(true)}>
          Sign out this device
        </Button>
      )}
      {revoke.isError ? (
        <Callout tone="alert" role="alert">
          {revoke.error.message}
        </Callout>
      ) : null}
    </Card>
  );
}
