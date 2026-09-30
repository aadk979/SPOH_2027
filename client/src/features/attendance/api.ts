import type {
  AttendanceStatus,
  AttendanceProof,
  AttendanceRecord,
  AttendanceChallenge,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export function getAttendance(eventId: string): Promise<AttendanceStatus> {
  return eventApi<AttendanceStatus>(eventId, '/attendance');
}
export function submitAttendance(
  eventId: string,
  proof: AttendanceProof,
): Promise<{ attendance: AttendanceRecord }> {
  return eventApi<{ attendance: AttendanceRecord }>(eventId, '/attendance/submit', {
    method: 'POST',
    body: proof,
  });
}
export function startAttendance(eventId: string): Promise<{ attendance: AttendanceRecord }> {
  return eventApi<{ attendance: AttendanceRecord }>(eventId, '/attendance/start', {
    method: 'POST',
  });
}
export function issueAttendanceChallenge(eventId: string): Promise<AttendanceChallenge> {
  return eventApi<AttendanceChallenge>(eventId, '/attendance/challenge', { method: 'POST' });
}
