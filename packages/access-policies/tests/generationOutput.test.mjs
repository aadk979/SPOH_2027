import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { actionOutputOptions, applyActionOutputs } from '../tools/actionOutput.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(ROOT, '.local');
const GENERATED = readFileSync(join(ROOT, 'src', 'generated', 'actions.ts'), 'utf8');

/** Each fake repository stays within this package's ignored fixtures, never the real shared tree. */
function fixture(testContext) {
  mkdirSync(LOCAL, { recursive: true });
  const localPath = realpathSync(LOCAL);
  if (dirname(localPath) !== realpathSync(ROOT))
    throw new Error('Fixture path escaped policy package');
  const directory = mkdtempSync(join(LOCAL, 'action-output-'));
  testContext.after(() => {
    const fixturePath = realpathSync(directory);
    if (dirname(fixturePath) !== localPath)
      throw new Error('Cleanup path escaped fixture directory');
    rmSync(fixturePath, { recursive: true, force: true });
  });
  const packageRoot = join(directory, 'packages', 'access-policies');
  for (const file of [
    'schema.cedarschema',
    'default-grants.json',
    'minimum-roles.json',
    'lib/catalogue.mjs',
    'lib/minimumRoles.mjs',
    'tools/generate-actions.mjs',
    'tools/actionOutput.mjs',
  ]) {
    const destination = join(packageRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(ROOT, file), destination);
  }
  return {
    decision: join(packageRoot, 'minimum-roles.json'),
    package: join(packageRoot, 'src', 'generated', 'actions.ts'),
    shared: join(directory, 'packages', 'shared', 'src', 'generated', 'actions', 'index.ts'),
    // File-boundary tests exercise the production output functions without repeating the
    // unrelated Cedar parse/Prettier startup. Default/shared/check and bad floor cases below
    // still invoke the real CLI, including its rendering and authored-input validation.
    write: (...arguments_) =>
      applyActionOutputs(GENERATED, actionOutputOptions(packageRoot, arguments_)),
    run: (...arguments_) =>
      spawnSync(
        process.execPath,
        [join(packageRoot, 'tools', 'generate-actions.mjs'), ...arguments_],
        {
          cwd: packageRoot,
          encoding: 'utf8',
        },
      ),
  };
}

test('default generation writes the package output without creating a shared tree', (t) => {
  const files = fixture(t);
  assert.equal(files.run().status, 0);
  assert.ok(existsSync(files.package));
  assert.ok(!existsSync(dirname(files.shared)));
  assert.equal(files.run('--check').status, 0);
});

test('explicit shared generation creates both identical standalone outputs', (t) => {
  const files = fixture(t);
  assert.equal(files.run('--shared-output').status, 0);
  assert.equal(readFileSync(files.shared, 'utf8'), readFileSync(files.package, 'utf8'));
  assert.equal(files.run('--check', '--shared-output').status, 0);
});

test('checking a missing opted-in shared output fails without creating directories', (t) => {
  const files = fixture(t);
  files.write();
  assert.throws(() => files.write('--shared-output', '--check'), { code: 'ENOENT' });
  assert.ok(!existsSync(dirname(files.shared)));
});

test('opted-in checks detect stale shared output and preserve its existing content', (t) => {
  const files = fixture(t);
  files.write('--shared-output');
  writeFileSync(files.shared, '// retained shared draft\n');
  files.write('--check');
  assert.throws(() => files.write('--check', '--shared-output'), /out of date/);
  assert.equal(readFileSync(files.shared, 'utf8'), '// retained shared draft\n');
});

test('opted-in checks also detect package output drift and repair neither artifact', (t) => {
  const files = fixture(t);
  files.write('--shared-output');
  const savedShared = readFileSync(files.shared, 'utf8');
  writeFileSync(files.package, '// retained package draft\n');
  assert.throws(() => files.write('--shared-output', '--check'), /out of date/);
  assert.equal(readFileSync(files.package, 'utf8'), '// retained package draft\n');
  assert.equal(readFileSync(files.shared, 'utf8'), savedShared);
});

test('unknown or path-bearing options fail before writing either artifact', (t) => {
  const files = fixture(t);
  for (const argument of ['--shared', '--shared-output=elsewhere.ts']) {
    assert.throws(() => files.write(argument), /Unknown action generation option/);
  }
  assert.ok(!existsSync(files.package));
  assert.ok(!existsSync(files.shared));
});

test('invalid authored floor input stops generation before either selected output is written', (t) => {
  const files = fixture(t);
  const decision = JSON.parse(readFileSync(files.decision, 'utf8'));
  decision.floors['People.Read'] = 'IC';
  writeFileSync(files.decision, JSON.stringify(decision));
  const result = files.run('--shared-output');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lowest approved default role/);
  assert.ok(!existsSync(files.package));
  assert.ok(!existsSync(files.shared));
});
