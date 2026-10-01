import type { AttendanceConfig, ChangeAttendanceConfigRequest } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { changeSetting } from '../../../platform/settings/change.js';
import { attendanceConfig } from './attendanceConfig.js';

/** Versioned, audited change to one attendance setting. */
export async function changeAttendanceConfig(
  change: ChangeAttendanceConfigRequest,
  actor: ActorContext,
): Promise<AttendanceConfig> {
  await changeSetting({
    target: { scope: 'event', eventId: actor.scope.eventId },
    key: change.key,
    value: change.value,
    expectedVersion: change.expectedVersion,
    actorPersonId: actor.volunteerId,
    audit: actor.audit,
  });
  return attendanceConfig(actor.scope);
}
