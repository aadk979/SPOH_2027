import type {
  AttendanceStatus,
  AttendanceProof,
  AttendanceRecord,
  AttendanceChallenge,
} from '@spoh/shared';
import { api } from '@/shared/lib/api';
export function getAttendance(): Promise<AttendanceStatus> {
  return api<AttendanceStatus>('/attendance');
}
export function submitAttendance(
  proof: AttendanceProof,
): Promise<{ attendance: AttendanceRecord }> {
  return api<{ attendance: AttendanceRecord }>('/attendance/submit', {
    method: 'POST',
    body: proof,
  });
}
export function startAttendance(): Promise<{ attendance: AttendanceRecord }> {
  return api<{ attendance: AttendanceRecord }>('/attendance/start', { method: 'POST' });
}
export function issueAttendanceChallenge(): Promise<AttendanceChallenge> {
  return api<AttendanceChallenge>('/attendance/challenge', { method: 'POST' });
}
