import type { AttendanceRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { activeShiftBlocks } from '../../../platform/time/index.js';
import { toAttendanceRecord } from '../data/mappers.js';
import {
  createAttendance,
  findAttendance,
  findUncheckedShifts,
  markShiftCheckedIn,
} from '../data/repo.js';

/**
 * Records the person present once per day, and checks them into any shift
 * running now. Idempotent: a second call returns the first record.
 */
export async function markPresent(
  tx: PrismaTransactionClient,
  presence: {
    personId: string;
    dayId: string;
    method: AttendanceRecord['method'];
    verifierId: string | null;
    now: Date;
  },
  audit: AuditContext,
): Promise<AttendanceRecord> {
  const { personId, dayId, method, verifierId, now } = presence;
  const existing = await findAttendance(tx, personId, dayId);
  const row =
    existing ??
    (await createAttendance(tx, {
      volunteerId: personId,
      eventDayId: dayId,
      method,
      verifiedById: verifierId,
      presentAt: now,
    }));
  if (!existing)
    await writeAudit(tx, {
      ...audit,
      action: 'attendance.present',
      entityType: 'Attendance',
      entityId: row.id,
      after: { eventDayId: dayId, method, verifiedById: verifierId, presentAt: now.toISOString() },
    });
  const shifts = await findUncheckedShifts(tx, {
    volunteerId: personId,
    eventDayId: dayId,
    blocks: { in: activeShiftBlocks(now) },
  });
  for (const shift of shifts) {
    if (await markShiftCheckedIn(tx, { id: shift.id, volunteerId: personId }, now))
      await writeAudit(tx, {
        ...audit,
        action: 'shift.checkIn',
        entityType: 'ShiftAssignment',
        entityId: shift.id,
        after: { checkedInAt: now.toISOString(), attendanceId: row.id },
      });
  }
  return toAttendanceRecord(row);
}
