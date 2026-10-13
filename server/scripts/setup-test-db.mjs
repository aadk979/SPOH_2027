import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testDatabaseEnvironment } from '../../scripts/test-database-environment.mjs';

export { testDatabaseEnvironment };

/** The test database is provisioned explicitly; this command only migrates that exact database. */
export function migrateTestDatabase(source = process.env) {
  const env = testDatabaseEnvironment(source);
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), env, stdio: 'inherit',
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) migrateTestDatabase();
