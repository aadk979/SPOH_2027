import type { RosterImportRow } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { accountOperationChanged, boundAccountForPerson } from '../../../platform/db/identityAccountRepo.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { accountProfileDigests, type AccountProfile } from '../../../platform/identity/accountProfile.js';
import { beginAccountOperation, createAccountForOperation, type AccountOperation } from '../../../platform/identity/accountOperation.js';
import { systemClock } from '../../../platform/time/index.js';
import { holdRosterPeople, rosterOrganisation } from '../data/identityStandingRepo.js';
import { findVolunteerByEmail } from '../data/repo.js';
import type { RosterActor } from './context.js';
import { currentRosterTarget } from './currentRosterTarget.js';

export interface RosterIdentity {
  sub: string; profile: AccountProfile; organisationId: string; created: boolean;
  personId?: string; expectedProfileDigest?: string; operation?: AccountOperation;
}

/** Authorize and commit a durable suppressed-creation intent before contacting the provider. */
export async function prepareRosterIdentity(row: RosterImportRow, actor: RosterActor): Promise<RosterIdentity> {
  const prepared = await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, actor.scope);
    await holdRosterPeople(tx, { scope: actor.scope, actorId: actor.volunteerId, emails: [row.email] });
    const organisationId = await rosterOrganisation(tx, actor.scope);
    const current = await findVolunteerByEmail(actor.scope, row.email, tx);
    const profile = await currentRosterTarget(tx, { actor, row, current, organisationId });
    if (current) {
      const bound = await boundAccountForPerson(tx, { targetPoolId: identityProvider.poolId ?? '',
        organisationId, personId: current.id });
      return { organisationId, profile, created: false, sub: current.cognitoSub,
        personId: current.id, expectedProfileDigest: accountProfileDigests(current).profileDigest,
        ...(bound && accountProfileDigests(profile).profileDigest === bound.profileDigest ? { operation: bound } : {}) };
    }
    const operation = await beginAccountOperation(tx, { targetPoolId: identityProvider.poolId ?? '',
      organisationId, actorPersonId: actor.volunteerId, profile, now: systemClock.now(), audit: actor.audit });
    return { organisationId, profile, created: false, sub: '', operation };
  });
  if (!prepared.operation) return prepared;
  const created = await createAccountForOperation({ operation: prepared.operation, profile: prepared.profile,
    role: row.role, provider: identityProvider, audit: actor.audit });
  if (!created.operation.providerSubject) throw accountOperationChanged();
  return { ...prepared, ...created, sub: created.operation.providerSubject };
}

/** The final SQL commit rechecks both current permission and the exact original target profile. */
export async function validateRosterIdentity(tx: PrismaTransactionClient, input: {
  row: RosterImportRow; actor: RosterActor; identity: RosterIdentity;
}) {
  const { row, actor, identity } = input;
  const current = await findVolunteerByEmail(actor.scope, row.email, tx);
  const profile = await currentRosterTarget(tx, { row, actor, current, organisationId: identity.organisationId });
  if (accountProfileDigests(profile).profileDigest !== accountProfileDigests(identity.profile).profileDigest ||
    (identity.personId && (!current || current.id !== identity.personId || current.cognitoSub !== identity.sub ||
      accountProfileDigests(current).profileDigest !== identity.expectedProfileDigest)) ||
    (identity.operation && current && current.id !== identity.operation.plannedPersonId)) throw accountOperationChanged();
  return { current, profile };
}
