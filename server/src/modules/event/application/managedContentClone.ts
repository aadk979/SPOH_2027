import { randomUUID } from 'node:crypto';
import type { CloneEventWizardRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { planCloneContentInTransaction } from '../../content/index.js';
import { lockManagedSource } from '../data/managedEventRepo.js';
import type { PlatformEventActor } from './platformEventActor.js';
import { requireOrganisationAuthority } from './organisationAuthority.js';

/** Storage cleanup ownership must commit before a clone creates its new Event and external bytes. */
export function prepareManagedContentClone(input: CloneEventWizardRequest, actor: PlatformEventActor) {
  const targetEventId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const source = await lockManagedSource(tx, { id: input.sourceEventId, organisationId: input.organisationId });
    if (!source) throw new NotFoundError('Event');
    await requireOrganisationAuthority(tx, { personId: actor.personId, subject: actor.sub,
      organisationId: input.organisationId, action: 'Platform.CloneEvent' });
    const contentStoragePlan = input.clone.copy?.content !== false
      ? await planCloneContentInTransaction(tx, { sourceEventId: source.id, eventId: targetEventId,
        personId: actor.personId, sub: actor.sub, now: systemClock.now() }) : undefined;
    return { targetEventId, contentStoragePlan };
  }, { timeout: 30_000 });
}
