import { env } from '../../../config/env.js';
import { isCampusIp } from '../../../platform/http/campusNetwork.js';

/** The configured root admin's email, if attendance is configured at all. */
export function rootEmail(): string | undefined {
  return env.ATTENDANCE_ROOT_EMAIL;
}

export function onCampus(ip: string | null | undefined): boolean {
  return isCampusIp(ip, env.ATTENDANCE_SP_CIDRS);
}

export function networkConfigured(): boolean {
  return env.ATTENDANCE_SP_CIDRS.length > 0;
}
