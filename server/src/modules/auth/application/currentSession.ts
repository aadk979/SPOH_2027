import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { personNeedsMfa } from '../data/securityRepo.js';
import type { PresentedSession } from '../data/repo.js';
import { refreshExpiry, sessionEnded } from '../domain/sessionRules.js';
import { adminSetting } from './sessionSecurity.js';
import { refreshSessionDays } from './sessionLifetime.js';
import type { loadVolunteer } from './issueSession.js';
import { originalSessionBoundary } from '../../../platform/db/sessionBoundaryRepo.js';

/** Called only while holding the current Person and membership fence. Rotation never extends a family. */
export async function currentSessionLimit(tx: PrismaTransactionClient, input: {
  session: PresentedSession; volunteer: Awaited<ReturnType<typeof loadVolunteer>>; now: Date;
}): Promise<Date> {
  const { session, volunteer, now } = input;
  const admin = await personNeedsMfa(volunteer.id, tx);
  const absolute = session.absoluteExpiresAt ?? await legacyFamilyBoundary(tx, { session, volunteer, admin });
  if (session.mfaPending || session.expiresAt <= now || absolute <= now) throw sessionEnded();
  if (admin) {
    const idleMs = (await adminSetting(volunteer.scope, 'security.adminIdleMinutes', tx)) * 60_000;
    if (now.getTime() - (session.lastUsedAt ?? session.issuedAt).getTime() >= idleMs) throw sessionEnded();
  }
  return absolute;
}

async function legacyFamilyBoundary(tx: PrismaTransactionClient, input: {
  session: PresentedSession; volunteer: Awaited<ReturnType<typeof loadVolunteer>>; admin: boolean;
}) {
  const original = await originalSessionBoundary(tx, { familyId: input.session.familyId, personId: input.volunteer.id });
  if (!original) throw sessionEnded();
  const configured = await refreshSessionDays(input.volunteer.scope, tx);
  const adminDuration = input.admin ? (await adminSetting(input.volunteer.scope, 'security.adminSessionHours', tx)) * 3_600_000 : Infinity;
  return new Date(Math.min(original.expiresAt.getTime(), refreshExpiry(original.issuedAt, Math.min(configured, 30)).getTime(),
    original.issuedAt.getTime() + adminDuration));
}
