import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  changedPaths,
  classifyPaths,
  deliveryDecision,
  git,
  isDocumentation,
} from './delivery-changes.mjs';

function repository(t) {
  const tempRoot = resolve(tmpdir());
  const cwd = mkdtempSync(join(tempRoot, 'spoh-delivery-test-'));
  assert.equal(dirname(cwd), tempRoot);
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(['init', '--quiet', '--initial-branch=main'], cwd);
  git(['config', 'user.name', 'Delivery fixture'], cwd);
  git(['config', 'user.email', 'delivery-fixture@example.invalid'], cwd);
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

test('only explicitly documentary inputs can bypass application acceptance', () => {
  const documentation = [
    'README.md',
    'ONBOARDING_AND_FEATURES.md',
    'docs/adr/ADR-009-migration-rollout.md',
    'remediation/phases/P10-config-scheduling.md',
    'remediation/progress.json',
    'remediation/reports/P10/staging-catalogue-evidence-2026-10-06.json',
  ];
  const application = [
    'client/src/main.ts',
    'client/public/client-config.json',
    'server/prisma/schema.prisma',
    'server/tests/integration/settings.test.ts',
    'infra/cdk/README.md',
    '.github/workflows/ci.yml',
    'Dockerfile',
    'package-lock.json',
    'scripts/delivery-changes.mjs',
    'remediation/reports/P09/totals.mjs',
    'remediation/reports/P05/pricing/cost.md',
    'remediation/reports/P08/pricing/cost.md',
    'remediation/reports/P08/pricing/prices.json',
    'reports/metrics/coverage-floor.json',
    'remediation/reports/P10/arbitrary-input.json',
    'unknown.md',
  ];
  for (const path of documentation) assert.equal(isDocumentation(path), true, path);
  for (const path of application) assert.equal(isDocumentation(path), false, path);
  assert.equal(classifyPaths(documentation).fullCi, false);
  assert.equal(classifyPaths([...documentation, application[0]]).fullCi, true);
  assert.equal(classifyPaths([]).fullCi, true);
});

test('malformed and traversing paths never qualify as documentation', () => {
  for (const path of [
    null,
    undefined,
    12,
    'docs\\guide.md',
    'docs/../server/main.md',
    '/docs/guide.md',
  ])
    assert.equal(isDocumentation(path), false, String(path));
});

test('a multi-commit push ending in documentation still requires application CI', (t) => {
  const repo = repository(t);
  const application = repo.commit({ 'server/src/main.ts': 'new runtime\n' });
  const head = repo.commit({ 'docs/operator guide.md': 'New instructions\n' });
  assert.equal(deliveryDecision(application, head, repo.cwd).fullCi, false);
  assert.equal(deliveryDecision(repo.base, head, repo.cwd).fullCi, true);
  assert.deepEqual(changedPaths(repo.base, head, repo.cwd), [
    'docs/operator guide.md',
    'server/src/main.ts',
  ]);
});

test('renaming runtime into documentation retains the removed runtime input', (t) => {
  const repo = repository(t);
  mkdirSync(join(repo.cwd, 'docs'));
  renameSync(join(repo.cwd, 'server/src/main.ts'), join(repo.cwd, 'docs/copied-runtime.md'));
  const head = repo.commit({});
  assert.deepEqual(changedPaths(repo.base, head, repo.cwd), [
    'docs/copied-runtime.md',
    'server/src/main.ts',
  ]);
  assert.equal(deliveryDecision(repo.base, head, repo.cwd).fullCi, true);
});

test('deleting a runtime file requires full acceptance', (t) => {
  const repo = repository(t);
  rmSync(join(repo.cwd, 'server/src/main.ts'));
  const head = repo.commit({ 'README.md': 'Deletion instructions\n' });
  assert.equal(deliveryDecision(repo.base, head, repo.cwd).fullCi, true);
});

test('Git paths with spaces and punctuation remain exact without shell parsing', (t) => {
  const repo = repository(t);
  const path = "docs/operator's guide [draft].md";
  const head = repo.commit({ [path]: 'Review\n' });
  assert.deepEqual(changedPaths(repo.base, head, repo.cwd), [path]);
  assert.equal(deliveryDecision(repo.base, head, repo.cwd).fullCi, false);
});

test('missing, malformed, zero and unavailable bases fail closed to full CI', (t) => {
  const repo = repository(t);
  const head = repo.commit({ 'README.md': 'Only documentation\n' });
  for (const base of [undefined, null, '', 'main', '0'.repeat(40), 'f'.repeat(40)]) {
    const decision = deliveryDecision(base, head, repo.cwd);
    assert.equal(decision.fullCi, true, String(base));
    assert.equal(decision.base, null, String(base));
  }
  assert.equal(deliveryDecision(head, head, repo.cwd).fullCi, true);
  assert.throws(() => deliveryDecision(repo.base, 'main', repo.cwd));
});

test('a base from divergent history cannot prove a documentation-only push', (t) => {
  const repo = repository(t);
  const head = repo.commit({ 'docs/main.md': 'Main instructions\n' });
  git(['checkout', '--quiet', '-b', 'divergent', repo.base], repo.cwd);
  const divergent = repo.commit({ 'docs/divergent.md': 'Other instructions\n' });
  const decision = deliveryDecision(divergent, head, repo.cwd);
  assert.equal(decision.fullCi, true);
  assert.equal(decision.base, null);
});
