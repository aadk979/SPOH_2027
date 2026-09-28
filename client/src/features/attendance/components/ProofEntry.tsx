import type { ReactNode } from 'react';
import type { AttendanceController, AttendanceData } from '../hooks/useAttendanceScreen';
import { Button, Callout } from '@/shared/ui';
import { AttendanceScanner } from '../AttendanceScanner';
import { PinEntry } from './PinEntry';
export function ProofEntry({
  data,
  controller,
}: {
  data: AttendanceData;
  controller: AttendanceController;
}): ReactNode {
  const { scanning, send, submit, setScanning } = controller;
  return (
    <>
      <p className="text-text-muted">
        {data.isExco
          ? 'Scan the root admin’s attendance QR.'
          : 'Scan a present exco’s or the root admin’s attendance QR.'}{' '}
        Both phones should be on SP Wi-Fi.
      </p>
      {!data.networkConfigured ? (
        <Callout>
          SP network verification is not configured yet. Use your verifier’s secondary PIN.
        </Callout>
      ) : !data.onCampusNetwork ? (
        <Callout>
          This phone is outside the configured SP network. Connect to SP Wi-Fi or use the secondary
          PIN.
        </Callout>
      ) : null}
      {scanning ? (
        <AttendanceScanner onScan={(token) => send({ method: 'QR', token })} />
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            submit.reset();
            setScanning(true);
          }}
          disabled={submit.isPending}
        >
          Scan again
        </Button>
      )}
      <PinEntry {...controller} />
    </>
  );
}
