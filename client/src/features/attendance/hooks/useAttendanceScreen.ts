import { useRef, useState } from 'react';
import type { AttendanceChallenge, AttendanceProof } from '@spoh/shared';
import {
  useAttendance,
  useSubmitAttendance,
  useStartAttendance,
  useIssueAttendanceChallenge,
} from '../queries';
export function useAttendanceScreen(enabled: boolean) {
  const [pin, setPin] = useState('');
  const [scanning, setScanning] = useState(true);
  const [code, setCode] = useState<AttendanceChallenge | null>(null);
  const inFlight = useRef(false);
  const status = useAttendance({ enabled, refetchInterval: 30_000 });
  const submit = useSubmitAttendance({
    onConfirmed: () => setPin(''),
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const start = useStartAttendance();
  const issue = useIssueAttendanceChallenge(setCode);
  function send(proof: AttendanceProof): void {
    if (inFlight.current) return;
    inFlight.current = true;
    setScanning(false);
    submit.mutate(proof);
  }

  return { pin, setPin, scanning, setScanning, code, setCode, status, submit, start, issue, send };
}
export type AttendanceController = ReturnType<typeof useAttendanceScreen>;
export type AttendanceData = NonNullable<AttendanceController['status']['data']>;
