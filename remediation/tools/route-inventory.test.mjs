import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventoryEnvironment, inventoryOptions } from './route-inventory-config.mjs';
import { walk } from './route-inventory-stack.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const url = 'postgresql://spoh:spoh@localhost:5435/spoh2027_test';
const env = { NODE_ENV: 'test', SPOH_SKIP_DOTENV: '1', DATABASE_URL: url, TEST_DATABASE_URL: url };

function withFixture(run) {
  const privateTemp = resolve(REPO, '.local/tmp');
  mkdirSync(privateTemp, { recursive: true });
  const root = mkdtempSync(join(privateTemp, 'spoh-inventory-'));
  const boundary = relative(resolve(REPO, '.local/tmp'), root);
  assert.ok(boundary && !isAbsolute(boundary) && boundary !== '..' && !boundary.startsWith(`..${sep}`), 'Test fixture must stay inside V1-main/.local/tmp');
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('no default, old-phase output, duplicate/unknown flags or traversal may rewrite evidence', () => withFixture((root) => {
  for (const args of [[], ['--out'], ['--unknown', 'x'], ['--out', 'remediation/reports/P04/routes.json'],
    ['--out', 'remediation/reports/P06/routes-before.json'], ['--out', '../escaped.json'],
    ['--out', 'remediation/reports/P16/new.json', '--diff', 'old.json'],
    ['--out', 'remediation/reports/P16/new.json', '--out', 'other.json']])
    assert.throws(() => inventoryOptions(args, root));
  assert.equal(existsSync(join(root, 'remediation')), false);
}));

test('a new P16 JSON is explicit and exclusive; historical comparison is read-only', () => withFixture((root) => {
  const target = 'remediation/reports/P16/new.json';
  assert.equal(inventoryOptions(['--out', target], root).out, join(root, target));
  mkdirSync(join(root, 'remediation/reports/P16'), { recursive: true });
  writeFileSync(join(root, target), 'preserve');
  assert.throws(() => inventoryOptions(['--out', target], root), /already exists/);
  assert.equal(inventoryOptions(['--diff', target], root).compareWith, join(root, target));
  assert.equal(readFileSync(join(root, target), 'utf8'), 'preserve');
}));

test('junction output and symlink comparison cannot escape the checkout boundary', () => withFixture((root) => {
  const source = join(root, 'checkout');
  const outside = join(root, 'outside');
  mkdirSync(join(source, 'remediation/reports'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(outside, 'snapshot.json'), '{}');
  symlinkSync(outside, join(source, 'remediation/reports/P16'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inventoryOptions(['--out', 'remediation/reports/P16/new.json'], source), /symbolic link/);
  assert.throws(() => inventoryOptions(['--diff', 'remediation/reports/P16/snapshot.json'], source), /symbolic link/);
  assert.equal(existsSync(join(outside, 'new.json')), false);
}));

test('inventory checks caller safety before replacing test-only provider composition', () => {
  assert.throws(() => inventoryEnvironment({ ...env, NODE_ENV: 'production' }, 'cognito'));
  assert.throws(() => inventoryEnvironment({ ...env, TEST_DATABASE_URL: url.replace('spoh2027_test', 'inventory_test') }, 'cognito'));
  const actual = inventoryEnvironment(env, 'cognito');
  assert.equal(actual.DATABASE_URL, url);
  assert.equal(actual.AUTH_PROVIDER, 'cognito');
  assert.equal(actual.COGNITO_DOMAIN, 'https://identity.example.invalid');
});

function fn(name) { return Object.defineProperty(() => {}, 'name', { value: name }); }
function route(path, ...names) { return { route: { path, methods: { get: true, post: false }, stack: [...names, 'handler'].map((name) => ({ handle: fn(name) })) } }; }
function middleware(name, mountPath = '/') { return { mountPath, handle: fn(name) }; }
function router(mountPath, stack) { return { mountPath, handle: { stack } }; }

test('composite authority stays ordered and path-specific context cannot contaminate aliases', () => {
  const routes = [];
  walk([middleware('global'), router('/api/v1', [
    route('/client-config'), middleware('eventFromPath', '/events/:eventId'),
    router('/events/:eventId', [middleware('requireAuth'), route('/workspace/entity', 'authorize(Entity.Read)', 'authorize(Audit.Read)')]),
    middleware('eventFromAlias', '/workspace'), router('/workspace', [middleware('requireAuth'), route('/entity', 'authorize(Entity.Read)')]),
    route('/other'),
  ])], '', [], routes);
  assert.deepEqual(routes[0].middleware, ['global']);
  assert.deepEqual(routes[1].middleware, ['global', 'eventFromPath', 'requireAuth', 'authorize(Entity.Read)', 'authorize(Audit.Read)']);
  assert.deepEqual(routes[1].authorization, ['Entity.Read', 'Audit.Read']);
  assert.deepEqual(routes[2].middleware, ['global', 'eventFromAlias', 'requireAuth', 'authorize(Entity.Read)']);
  assert.deepEqual(routes[3].middleware, ['global']);
  assert.equal(routes.length, 4);
});

test('same-prefix routers retain earlier passthrough auth and actual validation contracts', () => {
  const contract = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false };
  const validator = fn('validate(query)');
  const target = route('/two', 'authorize(Self.Read)');
  target.route.stack.splice(1, 0, { handle: validator });
  const rows = [];
  walk([router('/roster', [middleware('firstAuth'), route('/one')]),
    router('/roster', [middleware('secondAuth'), target])], '', [], rows,
  { validation: (handler) => handler === validator ? { query: contract } : undefined });
  assert.deepEqual(rows[1].middleware, ['firstAuth', 'secondAuth', 'authorize(Self.Read)', 'validate(query)']);
  assert.deepEqual(rows[1].requestSchemas, { query: contract });
});

test('retired P04 parser and unsafe current CLI exit before changing historical snapshots', () => {
  const snapshots = ['remediation/reports/P04/routes.json', 'remediation/reports/P04/routes.md', 'remediation/reports/P06/routes-before.json'];
  const hashes = () => snapshots.map((path) => createHash('sha256').update(readFileSync(join(REPO, path))).digest('hex'));
  const before = hashes();
  const output = `remediation/reports/P16/guard-refusal-${randomUUID()}.json`;
  const legacy = spawnSync(process.execPath, ['remediation/reports/P04/routes.mjs'], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /P04 route regeneration is retired/);
  const unsafe = spawnSync(process.execPath, ['remediation/tools/route-inventory.mjs', '--out', output], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env, TEST_DATABASE_URL: url.replace('spoh2027_test', 'inventory_test') } });
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /loopback spoh2027_test/);
  assert.equal(existsSync(join(REPO, output)), false);
  assert.deepEqual(hashes(), before);
});
