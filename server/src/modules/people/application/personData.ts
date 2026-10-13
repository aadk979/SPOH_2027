import { ERROR_CODES } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError, ForbiddenError } from '../../../platform/errors/index.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { anonymiseInTransaction } from './anonymise.js';
import { exportPersonData, erasePersonNotes } from '../data/personDataRepo.js';
import { permittedPerson, type PersonActor } from './personLifecycle.js';
import { personMutation } from './personMutation.js';

export async function readPersonData(id: string, actor: PersonActor) {
  return prisma.$transaction(async (tx) => {
    await permittedPerson(tx, id, actor);
    const data = await exportPersonData(tx, id);
    await writeAudit(tx, { ...actor.audit, actorId: actor.personId, actorSub: actor.sub,
      action: 'person.export', entityType: 'Person', entityId: id, after: { profile: true } });
    return { data, retained: ['Operational counts and audit identifiers remain after erasure.',
      'Identity-provider records and backups follow their separate approved retention.'] };
  });
}

/** An erasure request cannot silently keep an account or another event operational. */
export async function erasePersonData(id: string, input: { reason: string; actor: PersonActor }) {
  if (id === input.actor.personId) throw new ForbiddenError('Another platform administrator must handle your request.');
  const result = await personMutation({ personId: id, actorSub: input.actor.sub,
    operation: 'erase', idempotencyKey: input.actor.idempotencyKey, reason: input.reason,
    authorizeReplay: (tx) => permittedPerson(tx, id, input.actor) }, async (tx) => {
    const target = await permittedPerson(tx, id, input.actor);
    if (!target.deactivatedAt || target.eventMemberships.some((member) => ['ACTIVE', 'INVITED'].includes(member.status)))
      throw new ConflictError(ERROR_CODES.CONFLICT, 'Suspend this person across all events before processing the erasure request.');
    await erasePersonNotes(tx, id);
    const { sessionsRevoked, identityJournalsRemoved } = await anonymiseInTransaction(tx,
      { personId: id, now: systemClock.now(), reason: 'person-erased' });
    await writeAudit(tx, { ...input.actor.audit, actorId: input.actor.personId,
      actorSub: input.actor.sub, action: 'person.erase', entityType: 'Person', entityId: id,
      after: { requestReasonRecorded: true, operationalIdsRetained: true, sessionsRevoked, identityJournalsRemoved } });
    return { identityChanged: false, sessionsRevoked };
  });
  invalidateVolunteerCache();
  return result;
}
