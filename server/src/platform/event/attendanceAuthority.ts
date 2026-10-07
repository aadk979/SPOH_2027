import { prisma, type PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { isCampusIp } from '../http/campusNetwork.js';
import { resolveSetting, type SettingLayer } from '../settings/resolve.js';
import { storedSetting } from '../settings/scopedStore.js';

/** Read an event-only setting; malformed stored values fall back to the registry default. */
async function eventValue(
  scope: EventScope,
  key: 'attendance.rootMembershipId' | 'attendance.campusCidrs',
  db: PrismaTransactionClient,
): Promise<unknown> {
  const row = await storedSetting({ scope: 'event', eventId: scope.eventId }, key, db);
  const layers: SettingLayer[] = row ? [{ scope: 'event', ...row }] : [];
  return resolveSetting(key, layers).value;
}

/** The event member designated to open attendance, or no one until configured. */
export async function rootMembershipId(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<string | null> {
  const id = (await eventValue(scope, 'attendance.rootMembershipId', db)) as string | null;
  if (!id) return null;
  const member = await db.eventMembership.findFirst({
    where: { id, eventId: scope.eventId, status: 'ACTIVE', role: 'ADMIN' },
    select: { id: true },
  });
  return member?.id ?? null;
}

/** QR attendance is allowed only from this event's validated trusted ranges. */
export async function campusCidrs(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<string[]> {
  return (await eventValue(scope, 'attendance.campusCidrs', db)) as string[];
}

export function onCampus(ip: string | null | undefined, cidrs: readonly string[]): boolean {
  return isCampusIp(ip, cidrs);
}
