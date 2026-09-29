import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain ESM script without types; its two functions are what is under test.
import { applyGrants, applyRoles } from '../../scripts/db-roles.mjs';

/**
 * F04-015 / P08.3: the app role may insert and read the audit trail but never
 * rewrite it. Runs the real scripts and migrations on a scratch database.
 */
const base = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
);
const DB = 'spoh2027_roles_test';
const at = (user: string | null, password: string | null, database = DB): string => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  if (user) url.username = user;
  if (password) url.password = password;
  return url.toString();
};

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: at(null, null, 'postgres') });
  await client.connect();
  await client.query(sql);
  await client.end();
}

let app: pg.Client;

beforeAll(async () => {
  await admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin(`CREATE DATABASE ${DB}`);
  await applyRoles({
    adminUrl: at(null, null),
    migratorPassword: 'migrator-pw',
    appPassword: 'app-pw',
  });
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: at('spoh_migrator', 'migrator-pw') },
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  await applyGrants({ migratorUrl: at('spoh_migrator', 'migrator-pw') });
  app = new pg.Client({ connectionString: at('spoh_app', 'app-pw') });
  await app.connect();
}, 180_000);

afterAll(async () => {
  await app?.end();
  await admin(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
});

const insertAudit = `INSERT INTO "AuditLog" (id, action, "entityType", "entityId")
  VALUES ('audit-1', 'test.action', 'Test', 'x')`;

describe('database roles (F04-015)', () => {
  it('lets the app insert and read audit rows', async () => {
    await app.query(insertAudit);
    const { rowCount } = await app.query(`SELECT 1 FROM "AuditLog" WHERE id = 'audit-1'`);
    expect(rowCount).toBe(1);
  });

  it.each([
    `UPDATE "AuditLog" SET action = 'rewritten' WHERE id = 'audit-1'`,
    `DELETE FROM "AuditLog" WHERE id = 'audit-1'`,
    `TRUNCATE "AuditLog"`,
  ])('refuses the app %s', async (sql) => {
    await expect(app.query(sql)).rejects.toThrow(/permission denied/);
  });

  it('lets the app change ordinary data but not the schema or migration history', async () => {
    await app.query(`UPDATE "Station" SET name = name WHERE false`);
    await expect(app.query(`CREATE TABLE sneaky (id int)`)).rejects.toThrow(/permission denied/);
    await expect(app.query(`SELECT 1 FROM "_prisma_migrations"`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('is idempotent', async () => {
    await applyRoles({
      adminUrl: at(null, null),
      migratorPassword: 'migrator-pw',
      appPassword: 'app-pw',
    });
    await applyGrants({ migratorUrl: at('spoh_migrator', 'migrator-pw') });
  });
});
