import type { RosterImportRow } from '@spoh/shared';
import { identityProvider } from '../../identity/index.js';
import type { Volunteer } from '../data/repo.js';

/**
 * The identity subject for each person in the file: an existing account's, or
 * a new identity minted now. Outside the transaction on purpose: minting is a
 * network call to Cognito, and holding a transaction open across 200 of them
 * would be a long-running lock for no benefit.
 */
export async function mintIdentities(
  rows: readonly RosterImportRow[],
  accounts: ReadonlyMap<string, Volunteer>,
): Promise<Map<string, string>> {
  const identities = new Map<string, string>();
  for (const row of rows) {
    if (identities.has(row.email)) continue;
    const existing = accounts.get(row.email);
    const sub = existing
      ? existing.cognitoSub
      : (
          await identityProvider.ensureUser({
            email: row.email,
            displayName: row.displayName,
            role: row.role,
          })
        ).sub;
    identities.set(row.email, sub);
  }
  return identities;
}
