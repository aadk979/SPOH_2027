import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findingsIn } from './check-hardcoding.mjs';

const hits = (text) => findingsIn('client/src/example.ts', text);

function sourceRepository(t) {
  const tempRoot = resolve(tmpdir());
  const cwd = mkdtempSync(join(tempRoot, 'spoh-hardcoding-test-'));
  assert.equal(dirname(cwd), tempRoot);
  t.after(() => {
    assert.equal(dirname(resolve(cwd)), tempRoot);
    rmSync(cwd, { recursive: true, force: true });
  });
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd });
  const write = (path, text) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const scan = () => spawnSync(process.execPath, [fileURLToPath(new URL('./check-hardcoding.mjs', import.meta.url))],
    { cwd, encoding: 'utf8', timeout: 10000 });
  return { cwd, write, scan };
}

test('finds the F01 patterns: dates, the brand and venue, course codes, zones', () => {
  assert.equal(hits("const opens = '2027-01-06';").length, 1);
  assert.equal(hits("title: 'SPOH 2027 Ops'").length, 1);
  assert.equal(hits("label: 'Welcome Party at T19'").length, 1);
  assert.equal(hits("code: 'DCDF'").length, 1);
  assert.equal(hits("const TZ = 'Asia/Singapore';").length, 1);
});

test('leaves the package scope and ordinary code alone', () => {
  assert.deepEqual(hits("import type { MeResponse } from '@spoh/shared';"), []);
  assert.deepEqual(hits('const total = registrations + 2027;'), []);
});

test('honours a stated reason on the line, the line above, or the file', () => {
  assert.deepEqual(hits("const DB = 'spoh2027'; // hardcoding-allowed: storage name"), []);
  assert.deepEqual(hits("// hardcoding-allowed: storage name\nconst DB = 'spoh2027';"), []);
  assert.deepEqual(
    hits("// hardcoding-allowed-file: content\nconst a = 'T19';\nconst b = 'DAAA';"),
    [],
  );
  assert.equal(hits("// hardcoding-allowed:\nconst DB = 'spoh2027';").length, 1);
});

test('CLI checks newly authored untracked source alongside tracked source in every product root', t => {
  const fixture = sourceRepository(t);
  fixture.write('server/src/tracked.ts', "const venue = 'Singapore Polytechnic';\n");
  execFileSync('git', ['add', '--', 'server/src/tracked.ts'], { cwd: fixture.cwd });
  fixture.write('client/src/new.ts', "const zone = 'Asia/Singapore';\n");
  fixture.write('packages/shared/src/new.ts', "const opening = '2027-01-06';\n");
  const result = fixture.scan();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Event-specific literals in source \(3\)/);
  for (const path of ['server/src/tracked.ts', 'client/src/new.ts', 'packages/shared/src/new.ts'])
    assert.ok(result.stderr.includes(path), path);
});

test('CLI keeps generated/tests/ignored files outside scope and narrow reasons cannot hide adjacent event data', t => {
  const fixture = sourceRepository(t);
  fixture.write('.gitignore', 'server/src/ignored.ts\n');
  for (const path of ['server/src/generated/model.ts', 'client/src/view.test.ts', 'packages/shared/src/fixtures/event.ts', 'server/src/ignored.ts'])
    fixture.write(path, "const venue = 'Singapore Polytechnic';\n");
  fixture.write('server/src/protocol.ts', "// hardcoding-allowed: fixed platform protocol header\nconst header = 'X-SPOH-Deployment';\n");
  assert.equal(fixture.scan().status, 0);
  fixture.write('server/src/protocol.ts', "// hardcoding-allowed: fixed platform protocol header\nconst header = 'X-SPOH-Deployment';\nconst venue = 'Singapore Polytechnic';\n");
  const refused = fixture.scan();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /protocol\.ts:3: venue or brand/);
});
