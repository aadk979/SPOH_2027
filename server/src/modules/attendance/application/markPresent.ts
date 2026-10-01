import type { AttendanceRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { scheduledShifts } from '../../../platform/event/runningShifts.js';
import { toAttendanceRecord } from '../data/mappers.js';
import {
  createAttendance,
  findAttendance,
  findUncheckedShifts,
  markShiftCheckedIn,
} from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Records the person present once per day, and checks them into any shift
 * running now. Idempotent: a second call returns the first record.
 */
export async function markPresent(
  tx: PrismaTransactionClient,
  presence: {
    scope: EventScope;
    personId: string;
    dayId: string;
    method: AttendanceRecord['method'];
    verifierId: string | null;
    now: Date;
  },
  audit: AuditContext,
): Promise<AttendanceRecord> {
  const { scope, personId, dayId, method, verifierId, now } = presence;
  const existing = await findAttendance(tx, scope, { volunteerId: personId, eventDayId: dayId });
  const row =
    existing ??
    (await createAttendance(tx, scope, {
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
  if (row.rehearsal) return toAttendanceRecord(row);
  const shifts = await findUncheckedShifts(tx, scope, {
    volunteerId: personId,
    running: scheduledShifts(scope, now),
  });
  for (const shift of shifts) {
    if (await markShiftCheckedIn(tx, scope, { id: shift.id, volunteerId: personId, at: now }))
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
