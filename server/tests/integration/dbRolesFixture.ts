import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

/** Rebind identifiers only: the production grants and every migration stay under test. */
export function databaseRoleFixture(connectionString: string) {
  const base = new URL(connectionString);
  if (base.pathname !== '/spoh2027_test') {
    throw new Error('Database role tests must use spoh2027_test');
  }
  const suffix = randomBytes(8).toString('hex');
  const schema = `roles_${suffix}`;
  const migrator = `migrator_${suffix}`;
  const runtime = `app_${suffix}`;
  const password = randomBytes(24).toString('hex');
  const admin = new pg.Client({ connectionString: base.toString() });
  const app = connectAs(runtime);
  const owner = connectAs(migrator);

  function connectAs(role: string) {
    const url = new URL(base);
    url.username = role;
    url.password = password;
    return new pg.Client({ connectionString: url.toString(), options: `-c search_path=${schema}` });
  }

  function rebound(sql: string) {
    return sql
      .replace(/\bpublic\b/g, schema)
      .replace(/\bspoh_migrator\b/g, migrator)
      .replace(/\bspoh_app\b/g, runtime);
  }

  async function applyRoles() {
    const source = readFileSync(
      new URL('../../prisma/roles/01-roles.sql', import.meta.url),
      'utf8',
    );
    await admin.query(rebound(source));
    for (const role of [migrator, runtime]) {
      await admin.query(`ALTER ROLE ${role} PASSWORD ${admin.escapeLiteral(password)}`);
    }
  }

  async function applyGrants() {
    const source = readFileSync(
      new URL('../../prisma/roles/02-grants.sql', import.meta.url),
      'utf8',
    );
    await owner.query(rebound(source));
  }

  async function setup() {
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await applyRoles();
    await owner.connect();
    const migrations = new URL('../../prisma/migrations/', import.meta.url);
    for (const entry of readdirSync(migrations, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!entry.isDirectory()) continue;
      await owner.query(
        rebound(readFileSync(new URL(`${entry.name}/migration.sql`, migrations), 'utf8')),
      );
    }
    // Prisma creates this table itself. Clone its migrated structure, never its rows.
    await admin.query(
      `CREATE TABLE ${schema}."_prisma_migrations" (LIKE public."_prisma_migrations" INCLUDING ALL)`,
    );
    await admin.query(`ALTER TABLE ${schema}."_prisma_migrations" OWNER TO ${migrator}`);
    await applyGrants();
    await app.connect();
  }

  async function cleanup() {
    await app.end();
    await owner.end();
    try {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      for (const role of [runtime, migrator]) {
        // CONNECT and default privileges are dependencies even after the schema is gone.
        await admin.query(`DROP OWNED BY ${role}`);
        await admin.query(`DROP ROLE ${role}`);
      }
    } finally {
      await admin.end();
    }
  }

  return { app, owner, schema, setup, cleanup, applyRoles, applyGrants };
}
