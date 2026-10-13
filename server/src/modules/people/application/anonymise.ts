import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { invalidatePersonCredentials } from '../../auth/index.js';
import { anonymisePerson } from '../data/retentionRepo.js';
import { erasePersonalIdentityJournals } from '../data/personalOperationalRepo.js';

/** Repeat cleanup still removes credentials issued or retained after the first profile erasure. */
export async function anonymiseInTransaction(tx: PrismaTransactionClient,
  input: { personId: string; now: Date; reason: string }) {
  const people = await anonymisePerson(tx, input);
  const sessionsRevoked = await invalidatePersonCredentials(tx,
    { personId: input.personId, reason: input.reason, at: input.now });
  // These provider recovery journals contain personal digests and subjects. Delete dependants first;
  // actor attribution on other subjects' journals remains alongside operational audit attribution.
  const identityJournalsRemoved = await erasePersonalIdentityJournals(tx, input.personId);
  return { people, sessionsRevoked, identityJournalsRemoved };
}
