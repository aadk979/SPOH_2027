import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The test database is provisioned explicitly; this command only migrates that exact database. */
export function testDatabaseEnvironment(source) {
  if (source.NODE_ENV === 'production' || source.SPOH_SKIP_DOTENV !== '1' || !source.TEST_DATABASE_URL)
    throw new Error('Test migrations require explicit TEST_DATABASE_URL and SPOH_SKIP_DOTENV=1 outside production.');
  const address = new URL(source.TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(address.protocol) || address.pathname !== '/spoh2027_test' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname))
    throw new Error('Test migrations require the existing local spoh2027_test database.');
  const port = source.CI === 'true' ? '5432' : '5435';
  if (address.port !== port || (source.DATABASE_URL && source.DATABASE_URL !== source.TEST_DATABASE_URL))
    throw new Error('Test database URL and port must match the explicit local/CI test configuration.');
  return { ...source, DATABASE_URL: source.TEST_DATABASE_URL, SPOH_SKIP_DOTENV: '1' };
}

export function migrateTestDatabase(source = process.env) {
  const env = testDatabaseEnvironment(source);
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), env, stdio: 'inherit',
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) migrateTestDatabase();
