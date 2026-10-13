import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { accountOperationChanged } from '../../../platform/db/identityAccountRepo.js';
import { accountProfileDigests, identityDigest } from '../../../platform/identity/accountProfile.js';
import { boundRecoveryAccount, type RecoveryPerson } from '../data/repo.js';
import type { RecoveryItem, RecoveryPlan } from '../domain/plan.js';

/** An already-bound retry is recognised by its durable account; stale profile/subject plans never adopt strangers. */
export async function requirePlannedState(tx: PrismaTransactionClient, input: {
  plan: RecoveryPlan; item: RecoveryItem; person: RecoveryPerson;
}): Promise<'PLANNED' | 'BOUND'> {
  const { person, item, plan } = input;
  if (accountProfileDigests(person).profileDigest !== item.profileDigest) throw accountOperationChanged();
  const account = await boundRecoveryAccount(tx, { targetPoolId: plan.targetPoolId, personId: person.id });
  if (account?.state === 'BOUND' && account.organisationId === plan.organisationId &&
    account.providerSubject === person.cognitoSub && account.profileDigest === item.profileDigest) return 'BOUND';
  if (identityDigest(['subject', person.cognitoSub]) === item.expectedSubjectDigest) return 'PLANNED';
  throw accountOperationChanged();
}
