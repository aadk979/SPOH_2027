import { randomUUID } from 'node:crypto';
import type pg from 'pg';

/**
 * Security and privacy settings belong to the organisation's platform admins (CHANGES.md C9).
 * A spec that changes one promotes its actor for the test and calls the returned function to
 * restore the organisation role it had.
 */
export async function promoteToPlatformAdmin(
  db: pg.Client,
  email: string,
): Promise<() => Promise<void>> {
  const person = (
    await db.query<{ id: string; organisationId: string }>(
      `SELECT p.id, e."organisationId" FROM "Person" p
       JOIN "EventMembership" m ON m."personId" = p.id
       JOIN "Event" e ON e.id = m."eventId"
       WHERE p.email = $1 LIMIT 1`,
      [email],
    )
  ).rows[0];
  if (!person) throw new Error(`No fixture person ${email}`);
  const existing = (
    await db.query<{ id: string; role: string }>(
      'SELECT id, role FROM "OrganisationMembership" WHERE "organisationId"=$1 AND "personId"=$2',
      [person.organisationId, person.id],
    )
  ).rows[0];
  if (existing)
    await db.query('UPDATE "OrganisationMembership" SET role=$1 WHERE id=$2', [
      'PLATFORM_ADMIN',
      existing.id,
    ]);
  else
    await db.query(
      'INSERT INTO "OrganisationMembership" (id, "organisationId", "personId", role, "updatedAt") VALUES ($1,$2,$3,$4,NOW())',
      [randomUUID(), person.organisationId, person.id, 'PLATFORM_ADMIN'],
    );
  return async () => {
    if (existing)
      await db.query('UPDATE "OrganisationMembership" SET role=$1 WHERE id=$2', [
        existing.role,
        existing.id,
      ]);
    else
      await db.query(
        'DELETE FROM "OrganisationMembership" WHERE "organisationId"=$1 AND "personId"=$2',
        [person.organisationId, person.id],
      );
  };
}
