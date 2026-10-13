import { spawnSync } from 'node:child_process';

// Execute against the built runtime filesystem, with no network, mounts or credentials.
const image = process.argv[2];
if (process.argv.length !== 3 || !image || image.startsWith('-'))
  throw new Error('Usage: node scripts/check-image-verification.mjs <built image>');
const check = String.raw`
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parse } from 'parse5';
import { collectExecutableScriptTexts, compareStaticPaths, validateStaticClientManifest } from '@spoh/shared/static-client';
import { testDatabaseEnvironment } from './server/scripts/setup-test-db.mjs';
import { localBrowserFixtureEnvironment, legacyLocalLoadEnvironment } from './scripts/browser-test-environment.mjs';

assert.equal(process.versions.node.split('.')[0], '24');
assert.equal(process.getuid(), 1000);
for (const file of ['server/dist/index.js', 'server/dist/seed/prisma/seed.js', 'server/prisma/schema.prisma', 'entrypoint.sh'])
  assert.ok(statSync(file).isFile(), file);
const db = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test';
const local = { NODE_ENV: 'test', DEPLOYMENT_ENV: 'development', AUTH_PROVIDER: 'local',
  SPOH_SKIP_DOTENV: '1', DATABASE_URL: db, TEST_DATABASE_URL: db, E2E_DATABASE_URL: db,
  E2E_BASE_URL: 'http://localhost:4012', E2E_API_ORIGIN: 'http://localhost:4012',
  LOAD_TEST_API: 'http://localhost:4012', LOCAL_AUTH_SECRET: 'image-test-only-secret-at-least-thirty-two-chars' };
assert.equal(testDatabaseEnvironment(local).DATABASE_URL, db);
assert.equal(localBrowserFixtureEnvironment(local).databaseUrl, db);
assert.equal(legacyLocalLoadEnvironment(local).apiOrigin, local.LOAD_TEST_API);
assert.throws(() => testDatabaseEnvironment({ ...local, NODE_ENV: 'production' }));
assert.throws(() => localBrowserFixtureEnvironment({ ...local, DEPLOYMENT_ENV: 'staging' }));

function htmlFiles(prefix = '') {
  return readdirSync('client/out/' + prefix, { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink());
    const path = prefix + entry.name;
    return entry.isDirectory() ? htmlFiles(path + '/') : path.endsWith('.html') ? [path] : [];
  });
}
const observed = htmlFiles().sort(compareStaticPaths).map(path => {
  const bytes = readFileSync('client/out/' + path);
  const errors = [];
  const document = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    { scriptingEnabled: true, onParseError: error => errors.push(error.code) });
  assert.deepEqual(errors, []);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'),
    scriptHashes: [...new Set(collectExecutableScriptTexts(document).map(text =>
      "'sha256-" + createHash('sha256').update(text, 'utf8').digest('base64') + "'"))].sort(compareStaticPaths) };
});
const manifest = validateStaticClientManifest(JSON.parse(readFileSync('client/out.csp.json', 'utf8')), observed);
console.log(JSON.stringify({ runtimeImports: 'passed', productionGuards: 'passed',
  staticDocuments: manifest.documents.length, databaseConnectionAttempted: false }));
`;
const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '-i', '--entrypoint', 'node',
  image, '--input-type=module'], { input: check, stdio: ['pipe', 'inherit', 'inherit'] });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
