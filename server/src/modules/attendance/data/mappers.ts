import type { AttendanceRecord } from '@spoh/shared';

export function toAttendanceRecord(row: {
  id: string;
  presentAt: Date;
  method: AttendanceRecord['method'];
  verifiedBy: { displayName: string } | null;
}): AttendanceRecord {
  return {
    id: row.id,
    presentAt: row.presentAt.toISOString(),
    method: row.method,
    verifiedByName: row.verifiedBy?.displayName ?? null,
  };
}
