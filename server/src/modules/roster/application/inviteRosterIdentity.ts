import type { RosterImportRow } from '@spoh/shared';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { deliverIdentityInvitation } from '../../../platform/identity/invitationDelivery.js';
import { hasAuthenticatedRosterIdentity, holdRosterPeople } from '../data/identityStandingRepo.js';
import { findVolunteerByEmail } from '../data/repo.js';
import type { RosterActor } from './context.js';
import { currentRosterTarget } from './currentRosterTarget.js';
import { currentRoster } from './currentRoster.js';
import type { RosterIdentity } from './rosterIdentity.js';

/** The account is bound before this separately committed, pool-wide delivery attempt. */
export async function inviteRosterIdentity(input: {
  row: RosterImportRow;
  actor: RosterActor;
  identity: RosterIdentity;
}) {
  const { row, actor, identity } = input;
  if (!identity.operation) return;
  // Additional event membership does not need another temporary-password
  // invitation once this exact bound account has been used in the organisation.
  // Keep uncertain delivery journals intact for accounts that have not signed in.
  if (
    identity.operation.state === 'BOUND' &&
    (await hasAuthenticatedRosterIdentity({
      organisationId: identity.organisationId,
      personId: identity.operation.plannedPersonId,
      subject: identity.sub,
    }))
  )
    return;
  await deliverIdentityInvitation({
    provider: identityProvider,
    targetPoolId: identity.operation.targetPoolId,
    organisationId: identity.organisationId,
    personId: identity.operation.plannedPersonId,
    actorPersonId: actor.volunteerId,
    accountId: identity.operation.id,
    requestKey: identity.operation.id,
    audit: actor.audit,
    authorize: async (tx) => {
      await holdCaptureEvent(tx, actor.scope);
      await holdRosterPeople(tx, {
        scope: actor.scope,
        actorId: actor.volunteerId,
        emails: [row.email],
      });
      await currentRoster(tx, actor, { action: 'People.Invite', role: row.role });
      const current = await findVolunteerByEmail(actor.scope, row.email, tx);
      await currentRosterTarget(tx, {
        actor,
        row,
        current,
        organisationId: identity.organisationId,
      });
    },
  });
}
