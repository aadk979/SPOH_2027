import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { deliveryDecision, git } from './delivery-changes.mjs';
import {
  branchDecision,
  deployedDecision,
  manualDeploymentDecision,
  verifyDecision,
} from './staging-release.mjs';

function repository(t) {
  const tempRoot = resolve(tmpdir());
  const cwd = mkdtempSync(join(tempRoot, 'spoh-staging-test-'));
  assert.equal(dirname(cwd), tempRoot);
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(['init', '--quiet', '--initial-branch=main'], cwd);
  git(['config', 'user.name', 'Staging fixture'], cwd);
  git(['config', 'user.email', 'staging-fixture@example.invalid'], cwd);
  git(['config', 'commit.gpgsign', 'false'], cwd);
  git(['config', 'core.autocrlf', 'false'], cwd);
  function commit(files) {
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), contents);
    }
    git(['add', '--all'], cwd);
    git(['commit', '--quiet', '--message=Fixture'], cwd);
    return git(['rev-parse', 'HEAD'], cwd).trim();
  }
  const base = commit({ 'README.md': 'Initial docs\n', 'server/src/main.ts': 'initial runtime\n' });
  return { cwd, base, commit };
}

test('CI evidence must bind immutable head, schema and boolean decision to the real range', (t) => {
  const repo = repository(t);
  const head = repo.commit({ 'server/src/main.ts': 'Accepted application\n' });
  const manifest = deliveryDecision(repo.base, head, repo.cwd);
  assert.doesNotThrow(() => verifyDecision(manifest, head, repo.cwd));
  for (const invalid of [
    null,
    [],
    {},
    { ...manifest, head: repo.base },
    { ...manifest, schemaVersion: '1' },
    { ...manifest, schemaVersion: 2 },
    { ...manifest, fullCi: 'true' },
    { ...manifest, fullCi: false },
    { ...manifest, base: 'main' },
    { ...manifest, base: '0'.repeat(40) },
    { ...manifest, base: 'f'.repeat(40) },
  ])
    assert.throws(() => verifyDecision(invalid, head, repo.cwd));
});

test('missing comparison evidence cannot attest to documentation-only acceptance', (t) => {
  const repo = repository(t);
  const manifest = { schemaVersion: 1, head: repo.base, base: null, fullCi: true };
  assert.doesNotThrow(() => verifyDecision(manifest, repo.base, repo.cwd));
  assert.throws(() => verifyDecision({ ...manifest, fullCi: false }, repo.base, repo.cwd));
});

test('documentation-only evidence is verified against the exact Git range', (t) => {
  const repo = repository(t);
  const application = repo.commit({ 'server/src/main.ts': 'Application change\n' });
  const head = repo.commit({ 'README.md': 'Release acceptance\n' });
  const manifest = deliveryDecision(application, head, repo.cwd);
  assert.equal(manifest.fullCi, false);
  assert.doesNotThrow(() => verifyDecision(manifest, head, repo.cwd));
  assert.throws(() => verifyDecision({ ...manifest, base: repo.base }, head, repo.cwd));
});

test('new documentation does not discard the latest accepted application release', (t) => {
  const repo = repository(t);
  const release = repo.commit({ 'server/src/main.ts': 'Release runtime\n' });
  const docs = repo.commit({ 'remediation/reports/P10/acceptance.md': 'Verified\n' });
  assert.equal(branchDecision(release, release, repo.cwd).eligible, true);
  assert.equal(branchDecision(release, docs, repo.cwd).eligible, true);
});

test('a newer runtime change prevents an older CI from deploying', (t) => {
  const repo = repository(t);
  const release = repo.commit({ 'server/src/main.ts': 'First release\n' });
  repo.commit({ 'README.md': 'First acceptance\n' });
  const main = repo.commit({ 'server/src/main.ts': 'Newer runtime\n' });
  assert.equal(branchDecision(release, main, repo.cwd).eligible, false);
});

test('a newer validation input also prevents an older source from deploying', (t) => {
  const repo = repository(t);
  const release = repo.commit({ 'server/src/main.ts': 'Release runtime\n' });
  const main = repo.commit({ 'reports/metrics/coverage-floor.json': '{"lines":95}\n' });
  assert.equal(branchDecision(release, main, repo.cwd).eligible, false);
});

test('a release removed from main is refused even when histories differ only in docs', (t) => {
  const repo = repository(t);
  const main = repo.commit({ 'docs/main.md': 'Main docs\n' });
  git(['checkout', '--quiet', '-b', 'other', repo.base], repo.cwd);
  const release = repo.commit({ 'docs/other.md': 'Other docs\n' });
  assert.equal(branchDecision(release, main, repo.cwd).eligible, false);
});

test('deployment identity and obsolete releases never move staging backwards', (t) => {
  const repo = repository(t);
  const newer = repo.commit({ 'server/src/main.ts': 'New release\n' });
  assert.equal(deployedDecision(newer, newer, repo.cwd).eligible, false);
  assert.equal(deployedDecision(repo.base, newer, repo.cwd).eligible, false);
  assert.equal(deployedDecision(newer, repo.base, repo.cwd).eligible, true);
});

test('divergent or unverifiable staging history requires explicit recovery', (t) => {
  const repo = repository(t);
  const release = repo.commit({ 'server/src/main.ts': 'Main release\n' });
  git(['checkout', '--quiet', '-b', 'other', repo.base], repo.cwd);
  const deployed = repo.commit({ 'server/src/main.ts': 'Other release\n' });
  assert.throws(() => deployedDecision(release, deployed, repo.cwd));
  for (const unknown of ['', 'latest', '0'.repeat(40), 'f'.repeat(40)])
    assert.throws(() => deployedDecision(release, unknown, repo.cwd));
});

test('documentation-only acceptance exits before fetching or preparing a release', (t) => {
  const repo = repository(t);
  const head = repo.commit({ 'README.md': 'Documentation acceptance\n' });
  const manifestPath = join(repo.cwd, 'decision.json');
  const outputPath = join(repo.cwd, 'github-output');
  writeFileSync(manifestPath, JSON.stringify(deliveryDecision(repo.base, head, repo.cwd)));
  // No remote exists: reaching the release preparation fetch would fail this run.
  const output = execFileSync(
    process.execPath,
    [fileURLToPath(new URL('./staging-release.mjs', import.meta.url))],
    {
      cwd: repo.cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        DELIVERY_MANUAL: 'false',
        DELIVERY_MANIFEST: manifestPath,
        GITHUB_OUTPUT: outputPath,
      },
    },
  );
  assert.equal(JSON.parse(output).eligible, false);
  assert.equal(readFileSync(outputPath, 'utf8'), `eligible=false\nsha=${head}\n`);
});

test('missing or unreadable classification evidence cannot open the release gate', (t) => {
  const repo = repository(t);
  const manifestPath = join(repo.cwd, 'decision.json');
  const helper = fileURLToPath(new URL('./staging-release.mjs', import.meta.url));
  for (const contents of [null, 'invalid-json', '{"schemaVersion":1}']) {
    if (contents !== null) writeFileSync(manifestPath, contents);
    const result = spawnSync(process.execPath, [helper], {
      cwd: repo.cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        DELIVERY_MANUAL: 'false',
        DELIVERY_MANIFEST: manifestPath,
        GITHUB_OUTPUT: join(repo.cwd, 'github-output'),
      },
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /eligible=true/);
  }
});

const ciStartedAt = '2026-10-06T02:00:00Z';
const manualRun = (fields = {}) => ({
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'success',
  updated_at: '2026-10-06T01:00:00Z',
  ...fields,
});

test('a later successful or failed manual attempt fences the in-flight automatic release', () => {
  for (const conclusion of ['success', 'failure', 'timed_out', 'action_required', 'neutral']) {
    for (const updated_at of [ciStartedAt, '2026-10-06T03:00:00Z']) {
      const decision = manualDeploymentDecision(
        [manualRun({ conclusion, updated_at })],
        ciStartedAt,
      );
      assert.equal(decision.eligible, false, `${conclusion} at ${updated_at}`);
    }
  }
});

test('pending manual intent blocks automation even before completion timestamps arrive', () => {
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const run = manualRun({ status, conclusion: null, updated_at: null });
    assert.equal(manualDeploymentDecision([run], ciStartedAt).eligible, false, status);
  }
});

test('old completed attempts and later cancelled or skipped runs do not fence a new release', () => {
  assert.equal(manualDeploymentDecision([], ciStartedAt).eligible, true);
  assert.equal(manualDeploymentDecision([manualRun()], ciStartedAt).eligible, true);
  for (const conclusion of ['cancelled', 'skipped']) {
    const run = manualRun({ conclusion, updated_at: '2026-10-06T03:00:00Z' });
    assert.equal(manualDeploymentDecision([run], ciStartedAt).eligible, true, conclusion);
  }
  const blocked = [
    manualRun({ conclusion: 'cancelled', updated_at: '2026-10-06T03:00:00Z' }),
    manualRun({ conclusion: 'failure', updated_at: '2026-10-06T02:30:00Z' }),
  ];
  assert.equal(manualDeploymentDecision(blocked, ciStartedAt).eligible, false);
});

test('manual ordering refuses missing history, timestamps, event and status evidence', () => {
  for (const runs of [null, undefined, {}, 'unknown'])
    assert.throws(() => manualDeploymentDecision(runs, ciStartedAt));
  for (const started of [null, undefined, '', 'not-a-date'])
    assert.throws(() => manualDeploymentDecision([], started));
  for (const fields of [
    { event: 'push' },
    { event: undefined },
    { status: 'unknown' },
    { status: undefined },
    { updated_at: null },
    { updated_at: undefined },
    { updated_at: 'invalid' },
  ])
    assert.throws(() => manualDeploymentDecision([manualRun(fields)], ciStartedAt));
});

test('completed manual runs with missing or unrecognized conclusions fail closed', () => {
  for (const conclusion of [null, undefined, '', 'unknown'])
    assert.throws(() => manualDeploymentDecision([manualRun({ conclusion })], ciStartedAt));
});
