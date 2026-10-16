import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { testDatabaseEnvironment } from '../../../scripts/test-database-environment.mjs';

/** Trusted historical migrations run in an owned schema of the sole approved test database. */
export function namespaceMigrationSql(sql: string, schema: string): string {
  if (!/^migration_test_[a-f0-9]{32}$/.test(schema))
    throw new Error('An owned migration test schema is required.');
  if (
    /\b(?:CREATE|ALTER|DROP)\s+(?:DATABASE|SCHEMA)\b|\bSET\s+(?:(?:LOCAL|SESSION)\s+)?search_path\b/i.test(
      sql,
    )
  )
    throw new Error('Migration tests cannot change databases, schemas or their search path.');
  return sql.replace(/(?:\bpublic|"public")\./g, `"${schema}".`);
}

async function publicSchemaFingerprint(db: pg.Client): Promise<string> {
  const columns = await db.query(
    'SELECT table_name,column_name,udt_schema,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position',
    ['public'],
  );
  const functions = await db.query(
    'SELECT p.oid::text,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.prokind=$2 ORDER BY p.oid',
    ['public', 'f'],
  );
  const constraints = await db.query(
    'SELECT c.oid::text,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=$1 ORDER BY c.oid',
    ['public'],
  );
  const triggers = await db.query(
    'SELECT t.oid::text,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY t.oid',
    ['public'],
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        columns: columns.rows,
        functions: functions.rows,
        constraints: constraints.rows,
        triggers: triggers.rows,
      }),
    )
    .digest('hex');
}
async function assertDatabase(db: pg.Client): Promise<void> {
  const result = await db.query('SELECT current_database() AS name');
  if (result.rows[0]?.name !== 'spoh2027_test')
    throw new Error('Migration tests require the sole approved test database.');
}
export interface MigrationSchema {
  db: pg.Client;
  schema: string;
  apply(sql: string): Promise<pg.QueryResult>;
  close(): Promise<void>;
}

export async function openMigrationSchema(): Promise<MigrationSchema> {
  // Validate before constructing a client; no administrative /postgres connection exists.
  const environment = testDatabaseEnvironment(process.env);
  const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
  const db = new pg.Client({
    connectionString: environment.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  await db.connect();
  let created = false;
  try {
    await assertDatabase(db);
    const before = await publicSchemaFingerprint(db);
    await db.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const current = await db.query('SELECT current_schema() AS name');
    if (current.rows[0]?.name !== schema) throw new Error('Migration schema was not selected.');
    let closed = false;
    return {
      db,
      schema,
      apply: (sql) => db.query(namespaceMigrationSql(sql, schema)),
      async close() {
        if (closed) return;
        closed = true;
        try {
          await db.query('ROLLBACK');
          await assertDatabase(db);
          if ((await publicSchemaFingerprint(db)) !== before)
            throw new Error('Migration verification changed the public schema.');
          await db.query(`DROP SCHEMA "${schema}" CASCADE`);
        } finally {
          await db.end();
        }
      },
    };
  } catch (error) {
    try {
      await db.query('ROLLBACK');
      if (created) await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await db.end();
    }
    throw error;
  }
}
