import { prisma } from '../../../platform/db/client.js';
import { accountOperationChanged } from '../../../platform/db/identityAccountRepo.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { beginAccountOperation, createAccountForOperation, completeAccountOperation,
  type AccountOperation } from '../../../platform/identity/accountOperation.js';
import { identityDigest } from '../../../platform/identity/accountProfile.js';
import { identityProvider } from '../../../platform/identity/index.js';
import type { IdentityProvider } from '../../../platform/identity/provisioning.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { revokeAllInTransaction } from '../../auth/index.js';
import { rebindSubject } from '../data/repo.js';
import { isRecentPlan, RecoveryPlan, type RecoveryItem } from '../domain/plan.js';
import { holdRecoveryAuthority, verifyRecoveryOperator, type RecoveryOperator } from './authority.js';
import { requirePlannedState } from './recoveryState.js';

export interface RecoveryExecution {
  plan: unknown; operatorToken: string; reason: string; ownerApprovalReference: string;
  provider?: IdentityProvider;
}
export interface RecoveryRun {
  plan: RecoveryPlan; operator: RecoveryOperator; audit: AuditContext;
  provider: IdentityProvider; evidenceDigest: string; clock: Clock;
}

/** Real-person execution is an owner-approved stage; the command requires the reviewed plan and reference. */
export async function applyIdentityRecovery(input: RecoveryExecution, clock: Clock = systemClock) {
  const run = await prepareRecoveryRun(input, clock);
  const results: { personId: string; accountId: string; status: 'BOUND'; replayed: boolean }[] = [];
  for (const item of run.plan.items) results.push(await recoverItem(run, item));
  return { planId: run.plan.planId, bound: results.length, items: results };
}

export async function prepareRecoveryRun(input: RecoveryExecution, clock: Clock): Promise<RecoveryRun> {
  const plan = RecoveryPlan.parse(input.plan);
  if (!isRecentPlan(plan, clock.now()) || !input.reason.trim() || input.reason.length > 200 ||
    !input.ownerApprovalReference.trim() || input.ownerApprovalReference.length > 200)
    throw new ValidationError('A recent reviewed plan, reason and owner approval reference are required.');
  const provider = input.provider ?? identityProvider;
  if (provider.name !== 'cognito' || provider.poolId !== plan.targetPoolId)
    throw new ValidationError('The configured identity provider must match the reviewed target pool.');
  const operator = await verifyRecoveryOperator(input.operatorToken);
  return { plan, operator, provider, clock,
    evidenceDigest: identityDigest(['recovery-evidence', input.reason, input.ownerApprovalReference]),
    audit: { actorId: operator.personId, actorSub: operator.subject, eventId: null, membershipId: null,
      ip: null, userAgent: null, requestId: plan.planId } };
}

async function recoverItem(run: RecoveryRun, item: RecoveryItem) {
  const prepared = await prisma.$transaction(async (tx) => {
    const person = await holdRecoveryAuthority(tx, { ...run.plan, operator: run.operator,
      clock: run.clock, personId: item.personId });
    if (!person) throw accountOperationChanged();
    const state = await requirePlannedState(tx, { plan: run.plan, item, person });
    const operation = await beginAccountOperation(tx, { targetPoolId: run.plan.targetPoolId,
      organisationId: run.plan.organisationId, actorPersonId: run.operator.personId,
      personId: person.id, expectedSubject: person.cognitoSub, profile: person,
      now: run.clock.now(), audit: run.audit });
    if (operation.state === 'BOUND' && state !== 'BOUND') throw accountOperationChanged();
    return { operation, profile: person, replayed: state === 'BOUND' };
  });
  if (prepared.replayed) return { personId: item.personId, accountId: prepared.operation.id,
    status: 'BOUND' as const, replayed: true };
  const created = await createAccountForOperation({ ...prepared, role: 'VOLUNTEER',
    provider: run.provider, audit: run.audit });
  await bindRecoveredItem(run, { item, operation: created.operation });
  return { personId: item.personId, accountId: created.operation.id, status: 'BOUND' as const, replayed: false };
}

async function bindRecoveredItem(run: RecoveryRun, input: { item: RecoveryItem; operation: AccountOperation }) {
  await prisma.$transaction(async (tx) => {
    const person = await holdRecoveryAuthority(tx, { ...run.plan, operator: run.operator,
      clock: run.clock, personId: input.item.personId });
    if (!person || !input.operation.providerSubject) throw accountOperationChanged();
    const state = await requirePlannedState(tx, { plan: run.plan, item: input.item, person });
    if (state !== 'PLANNED') throw accountOperationChanged();
    const changed = await rebindSubject(tx, { personId: person.id, expectedSubject: person.cognitoSub,
      subject: input.operation.providerSubject });
    if (changed.count !== 1) throw accountOperationChanged();
    const sessionsRevoked = await revokeAllInTransaction(tx, { personId: person.id,
      reason: 'identity-recovered', at: run.clock.now() });
    await completeAccountOperation(tx, { operation: input.operation, personId: person.id,
      profile: person, audit: run.audit });
    await writeAudit(tx, { ...run.audit, action: 'user.reprovision', entityType: 'Person', entityId: person.id,
      after: { planId: run.plan.planId, accountId: input.operation.id, targetPoolId: run.plan.targetPoolId,
        evidenceDigest: run.evidenceDigest, sessionsRevoked } });
  });
}
