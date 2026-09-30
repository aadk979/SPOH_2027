'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceChallenge,
  AttendanceProof,
  AttendanceRecord,
  AttendanceStatus,
} from '@spoh/shared';
import { sessionKeys } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { getAttendance, submitAttendance, startAttendance, issueAttendanceChallenge } from './api';
export const attendanceKeys = { status: (eventId: string) => [eventId, 'attendance'] as const };
export function useAttendance(options: { enabled?: boolean; refetchInterval?: number } = {}) {
  const eventId = useEventId();
  return useQuery({
    queryKey: attendanceKeys.status(eventId),
    queryFn: () => getAttendance(eventId),
    ...options,
  });
}
function useConfirmAttendance(onConfirmed?: () => void) {
  const client = useQueryClient();
  const eventId = useEventId();
  return async (result: { attendance: AttendanceRecord }): Promise<void> => {
    client.setQueryData<AttendanceStatus>(attendanceKeys.status(eventId), (previous) =>
      previous ? { ...previous, attendance: result.attendance } : previous,
    );
    onConfirmed?.();
    await Promise.all([
      client.invalidateQueries({ queryKey: attendanceKeys.status(eventId) }),
      client.invalidateQueries({ queryKey: sessionKeys.me(eventId) }),
    ]);
  };
}
export function useSubmitAttendance(callbacks: { onConfirmed: () => void; onSettled: () => void }) {
  const eventId = useEventId();
  const confirm = useConfirmAttendance(callbacks.onConfirmed);
  return useMutation({
    mutationFn: (proof: AttendanceProof) => submitAttendance(eventId, proof),
    onSuccess: confirm,
    onSettled: callbacks.onSettled,
  });
}
export function useStartAttendance() {
  const eventId = useEventId();
  const confirm = useConfirmAttendance();
  return useMutation({ mutationFn: () => startAttendance(eventId), onSuccess: confirm });
}
export function useIssueAttendanceChallenge(onSuccess: (challenge: AttendanceChallenge) => void) {
  const eventId = useEventId();
  return useMutation({ mutationFn: () => issueAttendanceChallenge(eventId), onSuccess });
}
