import type { RosterImportRow } from '@spoh/shared';
import type { RosterActor } from './context.js';
import { prepareRosterIdentity, type RosterIdentity } from './rosterIdentity.js';

/** Each distinct account has its own durable suppressed-creation operation; no mail is sent here. */
export async function mintIdentities(rows: readonly RosterImportRow[],
  context: { actor: RosterActor }): Promise<Map<string, RosterIdentity>> {
  const identities = new Map<string, RosterIdentity>();
  for (const row of rows) {
    if (identities.has(row.email)) continue;
    identities.set(row.email, await prepareRosterIdentity(row, context.actor));
  }
  return identities;
}
