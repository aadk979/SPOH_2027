import { randomUUID } from 'node:crypto';
import { prisma } from '../../../platform/db/client.js';
import { holdIdentityPeople } from '../../../platform/db/identityAccountRepo.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { accountProfileDigests, identityDigest } from '../../../platform/identity/accountProfile.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { eligiblePeople, holdRecoveryEvents } from '../data/repo.js';
import { RecoveryPlan } from '../domain/plan.js';
import { holdRecoveryAuthority, verifyRecoveryOperator } from './authority.js';

/** Planning writes no journal, subject, invitation or quota; the reviewable artifact contains fingerprints only. */
export async function planIdentityRecovery(input: {
  organisationId: string; targetPoolId: string; operatorToken: string;
}, clock: Clock = systemClock): Promise<RecoveryPlan> {
  const operator = await verifyRecoveryOperator(input.operatorToken);
  const now = clock.now();
  return prisma.$transaction(async (tx) => {
    const candidates = await eligiblePeople(tx, input.organisationId);
    if (candidates.length > 1000) throw new ValidationError('Review a bounded recovery cohort before continuing.');
    const personIds = [operator.personId, ...candidates.map((candidate) => candidate.id)];
    await holdRecoveryEvents(tx, { ...input, personIds });
    await holdIdentityPeople(tx, personIds);
    await holdRecoveryAuthority(tx, { ...input, operator, clock });
    const items: RecoveryPlan['items'] = [];
    for (const candidate of candidates) {
      if (candidate.id === operator.personId) continue;
      const person = await holdRecoveryAuthority(tx, { ...input, operator, clock, personId: candidate.id });
      if (!person) continue;
      items.push({ personId: person.id, profileDigest: accountProfileDigests(person).profileDigest,
        expectedSubjectDigest: identityDigest(['subject', person.cognitoSub]) });
    }
    return RecoveryPlan.parse({ version: 1, planId: randomUUID(), plannedAt: now.toISOString(),
      organisationId: input.organisationId, targetPoolId: input.targetPoolId, items });
  }, { timeout: 30_000 });
}
