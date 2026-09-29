import { useRef, useState } from 'react';
import { AttendanceProof, type AttendanceChallenge } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import {
  useAttendance,
  useSubmitAttendance,
  useStartAttendance,
  useIssueAttendanceChallenge,
} from '../queries';
export function useAttendanceScreen(enabled: boolean) {
  const pinForm = useZodForm(AttendanceProof, { method: 'PIN' as const, pin: '' });
  const setPin = pinForm.setter('pin');
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
  /** The typed PIN, checked against the proof schema the server applies. */
  function sendPin(): void {
    const proof = pinForm.validate();
    if (proof) send(proof);
  }

  return {
    pin: pinForm.values.pin,
    pinError: pinForm.errors.pin ?? pinForm.errors._form,
    setPin,
    sendPin,
    scanning,
    setScanning,
    code,
    setCode,
    status,
    submit,
    start,
    issue,
    send,
  };
}
export type AttendanceController = ReturnType<typeof useAttendanceScreen>;
export type AttendanceData = NonNullable<AttendanceController['status']['data']>;
