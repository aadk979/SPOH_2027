import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { findPresence, findVolunteer } from '../data/repo.js';
import {
  assertIssuerPresent,
  assertVerifiedByRoot,
  isRoot,
  type Person,
} from '../domain/attendanceRules.js';
import { rootEmail } from './config.js';

/** The verifier, if they may issue codes today; a 403 otherwise. */
export async function assertIssuer(
  db: PrismaTransactionClient,
  issuerId: string,
  dayId: string,
): Promise<Person> {
  const issuer = await findVolunteer(db, issuerId);
  const present = await findPresence(db, issuerId, dayId);
  assertIssuerPresent(issuer, present, rootEmail());
  if (!isRoot(issuer, rootEmail())) {
    const root = present?.verifiedById ? await findVolunteer(db, present.verifiedById) : null;
    assertVerifiedByRoot(root, rootEmail());
  }
  return issuer;
}
