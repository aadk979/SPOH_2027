import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findVolunteer } from '../data/repo.js';

/** The person as attendance judges them, in this event; a 404 when they are not in it. */
export async function requireVolunteer(
  db: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<{ id: string; membershipId: string; role: string; active: boolean }> {
  const person = await findVolunteer(db, scope, id);
  if (!person) throw new NotFoundError('Volunteer');
  return person;
}
