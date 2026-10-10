import type { Action } from '@spoh/access-policies';
import { currentAuthorizer } from '../../../platform/access/engine.js';
import { uid } from '../../../platform/access/authorizer/types.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ForbiddenError, NotFoundError } from '../../../platform/errors/index.js';
import { readOrganisationAuthority, lockOrganisationAuthority } from '../data/organisationRepo.js';

/** Organisation actions work even before the organisation has its first event. */
export async function organisationAuthority(
  tx: PrismaTransactionClient,
  input: { personId: string; organisationId: string; action: Action },
): Promise<boolean> {
  const { personId, organisationId, action } = input;
  const { person, membership, organisation } = await readOrganisationAuthority(tx, input);
  if (!person || !organisation || !membership) throw new NotFoundError('Organisation');
  const principal = uid('Person', personId);
  const resource = uid('Organisation', organisationId);
  const decision = await currentAuthorizer().isAuthorized({
    principal,
    action,
    resource,
    eventId: null,
    context: { eventPhase: 'DRAFT', lateSyncAllowed: false, onTrustedNetwork: false },
    entities: [
      {
        uid: principal,
        attrs: {
          active: person.deactivatedAt === null,
          platformAdmin: membership.role === 'PLATFORM_ADMIN',
        },
        parents: [],
      },
      { uid: resource, attrs: {}, parents: [] },
    ],
  });
  return decision.allowed && decision.errors.length === 0;
}

export async function requireOrganisationAuthority(
  tx: PrismaTransactionClient,
  input: { personId: string; organisationId: string; action: Action },
): Promise<void> {
  await lockOrganisationAuthority(tx, input);
  if (!(await organisationAuthority(tx, input))) throw new ForbiddenError();
}
