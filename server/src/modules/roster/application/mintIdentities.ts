import type { RosterImportRow } from '@spoh/shared';
import { identityProvider } from '../../../platform/identity/index.js';
import type { Volunteer } from '../data/repo.js';
import { prisma } from '../../../platform/db/client.js';
import { identitiesByEmail } from '../../../platform/identity/deliveryQuota.js';
import type { RosterActor } from './context.js';
import { currentRoster } from './currentRoster.js';

/**
 * The identity subject for each person in the file: an existing account's, or
 * a new identity minted now. Each external creation holds its own short Event
 * lock, so archive cannot overtake delivery and a large CSV holds no one long transaction.
 */
export async function mintIdentities(
  rows: readonly RosterImportRow[],
  context: { accounts: ReadonlyMap<string, Volunteer>; actor: RosterActor },
): Promise<Map<string, string>> {
  const identities = new Map<string, string>();
  const global = await identitiesByEmail(prisma, rows.map((row) => row.email));
  for (const row of rows) {
    if (identities.has(row.email)) continue;
    const existing = context.accounts.get(row.email) ?? global.get(row.email);
    const sub = existing
      ? existing.cognitoSub
      : (
          await mintIdentity(row, context.actor)
        ).sub;
    identities.set(row.email, sub);
  }
  return identities;
}

function mintIdentity(row: RosterImportRow, actor: RosterActor) {
  return prisma.$transaction(async (tx) => {
    await currentRoster(tx, actor, { action: 'People.Invite', role: row.role });
    return identityProvider.ensureUser({ email: row.email,
      displayName: row.displayName, role: row.role });
  }, { timeout: 30_000 });
}
