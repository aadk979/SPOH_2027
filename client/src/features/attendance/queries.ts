'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttendanceRecord, AttendanceStatus, AttendanceChallenge } from '@spoh/shared';
import { sessionKeys } from '@/features/session';
import { getAttendance, submitAttendance, startAttendance, issueAttendanceChallenge } from './api';
export const attendanceKeys = { status: ['attendance'] as const };
export function useAttendance(options: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({ queryKey: attendanceKeys.status, queryFn: getAttendance, ...options });
}
function useConfirmAttendance(onConfirmed?: () => void) {
  const client = useQueryClient();
  return async (result: { attendance: AttendanceRecord }): Promise<void> => {
    client.setQueryData<AttendanceStatus>(attendanceKeys.status, (previous) =>
      previous ? { ...previous, attendance: result.attendance } : previous,
    );
    onConfirmed?.();
    await Promise.all([
      client.invalidateQueries({ queryKey: attendanceKeys.status }),
      client.invalidateQueries({ queryKey: sessionKeys.me }),
    ]);
  };
}
export function useSubmitAttendance(callbacks: { onConfirmed: () => void; onSettled: () => void }) {
  const confirm = useConfirmAttendance(callbacks.onConfirmed);
  return useMutation({
    mutationFn: submitAttendance,
    onSuccess: confirm,
    onSettled: callbacks.onSettled,
  });
}
export function useStartAttendance() {
  const confirm = useConfirmAttendance();
  return useMutation({ mutationFn: startAttendance, onSuccess: confirm });
}
export function useIssueAttendanceChallenge(onSuccess: (challenge: AttendanceChallenge) => void) {
  return useMutation({ mutationFn: issueAttendanceChallenge, onSuccess });
}
