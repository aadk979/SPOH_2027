import type { CommitteeRole } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../audit/index.js';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { prepareIdentityAccount, recordProviderIdentity, bindIdentityAccount,
  accountOperationChanged, type AccountOperation, type AccountPlan } from '../db/identityAccountRepo.js';
import { systemClock } from '../time/index.js';
import { accountProfileDigests, type AccountProfile } from './accountProfile.js';
import type { IdentityProvider } from './provisioning.js';

export type { AccountOperation } from '../db/identityAccountRepo.js';
export type { AccountProfile } from './accountProfile.js';

export async function beginAccountOperation(tx: PrismaTransactionClient,
  input: AccountPlan & { audit: AuditContext }): Promise<AccountOperation> {
  const operation = await prepareIdentityAccount(tx, input);
  if (operation.state !== 'BOUND') await writeAudit(tx, { ...input.audit,
    action: 'identity.account.start', entityType: 'IdentityAccountOperation', entityId: operation.id,
    after: { state: operation.state, targetPoolId: operation.targetPoolId, personId: operation.personId } });
  return operation;
}

/** The persisted random operation marker proves account ownership after a crash or SQL rollback. */
export async function createAccountForOperation(input: {
  operation: AccountOperation; profile: AccountProfile; role: CommitteeRole;
  provider: IdentityProvider; audit: AuditContext;
}): Promise<{ operation: AccountOperation; created: boolean }> {
  const { operation, provider } = input;
  if (operation.state !== 'CREATE_STARTED') return { operation, created: false };
  if (provider.poolId !== operation.targetPoolId ||
    accountProfileDigests(input.profile).profileDigest !== operation.profileDigest) throw accountOperationChanged();
  const result = await provider.ensureUser({ ...input.profile, role: input.role, operationId: operation.id });
  if (!result.sub || (provider.name === 'cognito' && !result.username)) throw accountOperationChanged();
  const recorded = await prisma.$transaction(async (tx) => {
    const row = await recordProviderIdentity(tx, { operation, sub: result.sub,
      username: result.username ?? input.profile.email, now: systemClock.now() });
    await writeAudit(tx, { ...input.audit, action: 'identity.account.ready',
      entityType: 'IdentityAccountOperation', entityId: row.id,
      after: { state: row.state, accountCreated: result.created } });
    return row;
  });
  return { operation: recorded, created: result.created };
}

export async function completeAccountOperation(tx: PrismaTransactionClient, input: {
  operation: AccountOperation; personId: string; profile: AccountProfile; audit: AuditContext;
}): Promise<void> {
  await bindIdentityAccount(tx, { ...input, now: systemClock.now() });
  await writeAudit(tx, { ...input.audit, action: 'identity.account.bind',
    entityType: 'IdentityAccountOperation', entityId: input.operation.id,
    after: { state: 'BOUND', personId: input.personId, targetPoolId: input.operation.targetPoolId } });
}
