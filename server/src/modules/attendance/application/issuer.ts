import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { findPresence, findVolunteer } from '../data/repo.js';
import {
  assertIssuerPresent,
  assertVerifiedByRoot,
  isRoot,
  type Person,
} from '../domain/attendanceRules.js';
import { rootMembershipId } from './config.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** The verifier, if they may issue codes today; a 403 otherwise. */
export async function assertIssuer(
  db: PrismaTransactionClient,
  scope: EventScope,
  issuance: { issuerId: string; dayId: string },
): Promise<Person> {
  const { issuerId, dayId } = issuance;
  const configuredRoot = await rootMembershipId(scope, db);
  const issuer = await findVolunteer(db, scope, issuerId);
  const present = await findPresence(db, scope, { volunteerId: issuerId, eventDayId: dayId });
  assertIssuerPresent(issuer, present, configuredRoot);
  if (!isRoot(issuer, configuredRoot)) {
    const root = present?.verifiedById
      ? await findVolunteer(db, scope, present.verifiedById)
      : null;
    assertVerifiedByRoot(root, configuredRoot);
  }
  return issuer;
}
