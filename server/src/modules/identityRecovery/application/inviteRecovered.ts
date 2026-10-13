import { z } from 'zod';
import { prisma } from '../../../platform/db/client.js';
import { accountOperationChanged } from '../../../platform/db/identityAccountRepo.js';
import { deliverIdentityInvitation } from '../../../platform/identity/invitationDelivery.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { boundRecoveryAccount } from '../data/repo.js';
import { holdRecoveryAuthority } from './authority.js';
import { prepareRecoveryRun, type RecoveryExecution } from './applyRecovery.js';
import { requirePlannedState } from './recoveryState.js';

/** Invitation is explicit and separate from rebind. A fresh intentional resend uses a new UUID. */
export async function inviteRecoveredIdentities(input: RecoveryExecution & { resendKey?: string },
  clock: Clock = systemClock) {
  const run = await prepareRecoveryRun(input, clock);
  const resendKey = input.resendKey === undefined ? undefined : z.uuid().parse(input.resendKey);
  let accepted = 0;
  for (const item of run.plan.items) {
    const account = await prisma.$transaction(async (tx) => {
      const person = await holdRecoveryAuthority(tx, { ...run.plan, operator: run.operator,
        clock, personId: item.personId });
      if (!person || await requirePlannedState(tx, { plan: run.plan, item, person }) !== 'BOUND')
        throw accountOperationChanged();
      return boundRecoveryAccount(tx, { targetPoolId: run.plan.targetPoolId, personId: person.id });
    });
    if (!account || account.state !== 'BOUND') throw accountOperationChanged();
    const accountId = account.id;
    const delivery = await deliverIdentityInvitation({ targetPoolId: run.plan.targetPoolId,
      organisationId: run.plan.organisationId, actorPersonId: run.operator.personId,
      personId: item.personId, accountId, requestKey: resendKey ?? accountId,
      provider: run.provider, audit: run.audit, authorize: async (tx) => {
        const person = await holdRecoveryAuthority(tx, { ...run.plan, operator: run.operator,
          clock, personId: item.personId });
        if (!person || await requirePlannedState(tx, { plan: run.plan, item, person }) !== 'BOUND')
          throw accountOperationChanged();
      } });
    if (delivery.sent) accepted++;
  }
  return { planId: run.plan.planId, attempted: run.plan.items.length, accepted };
}
