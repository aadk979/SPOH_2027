import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { currentManagement } from './currentManagement.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';
import { revokeAllInTransaction } from '../../auth/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { reserveIdentityDeliveries } from '../../../platform/identity/deliveryQuota.js';

export async function resendInvite(id: string, actor: ManagerContext) {
  const target = await loadTarget(id, actor, 'resend');
  return prisma.$transaction(async (tx) => {
    await currentManagement(tx, actor, { id, action: 'People.Update' });
    await reserveIdentityDeliveries(tx, { scope: actor.scope, count: 1, now: systemClock.now() });
    const sent = await identityProvider.resendInvite(target.email);
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.resendInvite',
      entityType: 'Person',
      entityId: id,
      after: { sent },
    });
    return { sent };
  }, { timeout: 30_000 });
}

export async function signOutPerson(id: string, actor: ManagerContext) {
  return prisma.$transaction(async (tx) => {
    await currentManagement(tx, actor, { id, action: 'People.Deactivate' });
    const sessionsRevoked = await revokeAllInTransaction(tx, {
      personId: id,
      at: systemClock.now(),
      reason: 'signed-out-by-administrator',
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'session.revoke',
      entityType: 'Person',
      entityId: id,
      after: { sessionsRevoked, reason: 'signed-out-by-administrator' },
    });
    return { sessionsRevoked };
  });
}
