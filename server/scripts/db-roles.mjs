/**
 * Database roles and grants (P08.3, F04-015), for the one-off migrate task.
 *
 *   node scripts/db-roles.mjs roles    as the admin, before migrations
 *     ADMIN_DATABASE_URL, MIGRATOR_PASSWORD, APP_PASSWORD
 *   node scripts/db-roles.mjs grants   as spoh_migrator, after migrations
 *     DATABASE_URL
 *
 * Both steps are idempotent. Passwords come from the environment (Secrets
 * Manager in AWS) and are never logged.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const SQL = (name) => readFileSync(new URL(`../prisma/roles/${name}`, import.meta.url), 'utf8');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function withClient(url, work) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

export async function applyRoles({ adminUrl, migratorPassword, appPassword }) {
  await withClient(adminUrl, async (client) => {
    await client.query(SQL('01-roles.sql'));
    for (const [role, password] of [
      ['spoh_migrator', migratorPassword],
      ['spoh_app', appPassword],
    ]) {
      await client.query(`ALTER ROLE ${role} PASSWORD ${client.escapeLiteral(password)}`);
    }
  });
}

export async function applyGrants({ migratorUrl }) {
  await withClient(migratorUrl, (client) => client.query(SQL('02-grants.sql')));
}

const step = process.argv[2];
if (step === 'roles') {
  await applyRoles({
    adminUrl: required('ADMIN_DATABASE_URL'),
    migratorPassword: required('MIGRATOR_PASSWORD'),
    appPassword: required('APP_PASSWORD'),
  });
  console.log('roles applied');
} else if (step === 'grants') {
  await applyGrants({ migratorUrl: required('DATABASE_URL') });
  console.log('grants applied');
} else if (step !== undefined) {
  throw new Error(`unknown step "${step}": use roles or grants`);
}
