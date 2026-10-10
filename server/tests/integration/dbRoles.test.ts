import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseRoleFixture } from './dbRolesFixture.js';

/**
 * F04-015 / P08.3: the app role may insert and read the audit trail but never
 * rewrite it. The real SQL and migrations run in a disposable schema inside
 * spoh2027_test; no other database or existing cluster role is changed.
 */
const fixture = databaseRoleFixture(
  process.env.TEST_DATABASE_URL ?? 'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
);
const { app } = fixture;
beforeAll(() => fixture.setup(), 180_000);
afterAll(() => fixture.cleanup());

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

  it('grants ordinary data access to future migrator-owned tables', async () => {
    await fixture.owner.query('CREATE TABLE "FutureData" (id INTEGER PRIMARY KEY, value TEXT)');
    await app.query('INSERT INTO "FutureData" (id, value) VALUES (1, \'initial\')');
    await app.query('UPDATE "FutureData" SET value = \'updated\' WHERE id = 1');
    const { rows } = await app.query('SELECT value FROM "FutureData" WHERE id = 1');
    expect(rows).toEqual([{ value: 'updated' }]);
    await app.query('DELETE FROM "FutureData" WHERE id = 1');
  });

  it('permits only the restricted audit retention function', async () => {
    const { rows } = await app.query('SELECT prune_expired_audit() AS deleted');
    expect(rows).toEqual([{ deleted: 0 }]);
    expect((await app.query('SELECT id FROM "AuditLog"')).rows).toEqual([{ id: 'audit-1' }]);
  });

  it('cannot shorten recent audit retention by backdating mutable event metadata', async () => {
    await app.query(`INSERT INTO "Organisation" (id, slug, name, "appName", "defaultTimezone", "updatedAt")
      VALUES ('retention-org', 'retention-org', 'Retention test', 'Test', 'UTC', CURRENT_TIMESTAMP)`);
    await app.query(`INSERT INTO "Event" (id, "organisationId", slug, name, timezone, status, "updatedAt")
      VALUES ('retention-event', 'retention-org', 'retention-event', 'Retention test', 'UTC', 'LIVE', CURRENT_TIMESTAMP)`);
    await app.query(`INSERT INTO "AuditLog" (id, "eventId", action, "entityType", "createdAt") VALUES
      ('recent-archive-audit', 'retention-event', 'test', 'Test', CURRENT_TIMESTAMP),
      ('expired-archive-audit', 'retention-event', 'test', 'Test', CURRENT_TIMESTAMP - INTERVAL '401 days')`);
    await app.query(`UPDATE "Event" SET status = 'ARCHIVED', "archivedAt" = CURRENT_TIMESTAMP - INTERVAL '401 days'
      WHERE id = 'retention-event'`);
    expect((await app.query('SELECT prune_expired_audit() AS deleted')).rows).toEqual([{ deleted: 1 }]);
    expect((await app.query(`SELECT id FROM "AuditLog" ORDER BY id`)).rows).toEqual([
      { id: 'audit-1' }, { id: 'recent-archive-audit' },
    ]);
    await expect(app.query(`CREATE OR REPLACE FUNCTION prune_expired_audit() RETURNS INTEGER
      LANGUAGE sql AS 'SELECT 0'`)).rejects.toThrow(/permission denied|must be owner/);
  });

  it('refuses any other database before opening a connection', () => {
    expect(() => databaseRoleFixture('postgresql://spoh:spoh@localhost:5435/spoh2027')).toThrow(
      'Database role tests must use spoh2027_test',
    );
  });

  it('is idempotent', async () => {
    await fixture.applyRoles();
    await fixture.applyGrants();
  });
});
