import type { TestAttendanceNetworkResponse } from '@spoh/shared';
import { ValidationError } from '../../../platform/errors/index.js';
import { isCampusIp } from '../../../platform/http/campusNetwork.js';
import { SETTINGS } from '../../../platform/settings/registry.js';

/** Test draft CIDRs against the address the server actually sees. */
export function testAttendanceNetwork(
  ip: string | undefined,
  proposed: readonly string[],
): TestAttendanceNetworkResponse {
  const parsed = SETTINGS['attendance.campusCidrs'].schema.safeParse(proposed);
  if (!parsed.success) throw new ValidationError('Invalid trusted network', parsed.error.issues);
  return { ip: ip ?? null, trusted: isCampusIp(ip, parsed.data) };
}
