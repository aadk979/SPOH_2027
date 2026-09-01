import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Create and migrate the integration-test database.
 *
 * The integration suite deletes every row it finds, so it runs against its own
 * database rather than the one a developer has been working in. This script
 * creates that database if it does not exist and brings its schema up to date.
 *
 * Idempotent: safe to run before every test invocation, which is what
 * `pretest:integration` does.
 */

const DEFAULT_URL = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test';

function loadLocalEnv() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // Not a developer machine.
  }
}

loadLocalEnv();

const testUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
const parsed = new URL(testUrl);
const databaseName = parsed.pathname.replace(/^\//, '');

if (!/_test$/i.test(databaseName)) {
  // The same guard as tests/helpers/db.ts, applied before anything is created.
  throw new Error(
    `refusing to use "${databaseName}" as a test database: the name must end in _test`,
  );
}

// Connect to the maintenance database to issue CREATE DATABASE.
const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';

const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();

const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
  databaseName,
]);

if (rowCount === 0) {
  // The identifier cannot be parameterised, so it is quoted after the _test
  // check above has already constrained what it can be.
  await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
  console.log(`created test database ${databaseName}`);
}

await client.end();

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, DATABASE_URL: testUrl },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
