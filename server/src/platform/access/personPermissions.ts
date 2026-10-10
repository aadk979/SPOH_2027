import { ACTION_CATALOGUE, ACTION_IDS } from '@spoh/access-policies';
import type { PrismaTransactionClient } from '../db/client.js';
import { systemClock } from '../time/index.js';
import { EntityBuilder, type ResourceRef } from './authorizer/index.js';
import { currentAuthorizer } from './engine.js';

export async function personPermissions(
  db: PrismaTransactionClient,
  input: { eventId: string; membershipId: string },
) {
  const member = await db.eventMembership.findFirstOrThrow({
    where: { eventId: input.eventId, id: input.membershipId },
    select: { personId: true, event: { select: { organisationId: true } } },
  });
  const builder = new EntityBuilder(db, { eventId: input.eventId, now: systemClock.now() });
  const actions: Record<string, boolean> = {};
  for (const action of ACTION_IDS.filter((id) => id.startsWith('Platform.'))) {
    const resource: ResourceRef = (
      ACTION_CATALOGUE[action].resourceTypes as readonly string[]
    ).includes('Organisation')
      ? { type: 'Organisation', id: member.event.organisationId }
      : { type: 'Event', id: input.eventId };
    const request = await builder.forPerson(member.personId, { action, resource });
    const decision = await currentAuthorizer().isAuthorized(request);
    actions[action] = decision.allowed && decision.errors.length === 0;
  }
  return actions;
}
