import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const cli = 'remediation/reports/P05/pricing/cost-model.mjs';
const reconciler = 'remediation/reports/P08/pricing/reconcile-cost.mjs';
const prices = 'remediation/reports/P08/pricing/prices.json';
const amendments = 'remediation/reports/P08/pricing/amendments.json';
const output = resolve('.local/pricing-checks/cost.md');
mkdirSync(resolve('.local/pricing-checks'), { recursive: true });
const run = (args) => execFileSync(process.execPath, args, { encoding: 'utf8' });
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const totals = (report) =>
  report
    .match(/^\| \*\*lean\*\*.*$/m)[0]
    .split('|')
    .slice(2, 7)
    .map((cell) => cell.trim());

test('historical default model reproduces signed-off totals without altering P05 outputs', () => {
  const before = hash('remediation/reports/P05/pricing/cost.md');
  const report = run([cli, '--output', output]);
  assert.deepEqual(totals(report), ['36.46', '77.38', '56.39', '96.99', '40.19']);
  assert.equal(hash('remediation/reports/P05/pricing/cost.md'), before);
});

test('fresh snapshots reproduce the preserved five draft totals', () => {
  const report = run([cli, '--prices', prices, '--amendments', amendments, '--output', output]);
  assert.deepEqual(totals(report), ['46.27', '87.28', '66.29', '106.89 ⚠️', '50.09']);
});

test('strict amendments refuse malformed and inherited keys before writing the output', () => {
  const path = resolve('.local/pricing-checks/invalid.json');
  for (const value of [
    'null',
    '[]',
    '{"extra":1}',
    '{"constructor":1}',
    '{"__proto__":1}',
    '{"stagingEdgeUsdMonth":-1}',
    '{"stagingAlarmMetrics":0.5}',
    '{"stagingCustomMetrics":1e999}',
    '{"extraProdAlarmMetrics":"1"}',
  ]) {
    writeFileSync(path, value);
    writeFileSync(output, 'sentinel');
    const result = spawnSync(process.execPath, [cli, '--amendments', path, '--output', output]);
    assert.notEqual(result.status, 0, value);
    assert.equal(readFileSync(output, 'utf8'), 'sentinel');
  }
});

test('importing either model never writes a report', () => {
  const before = hash('remediation/reports/P05/pricing/cost.md');
  run(['--input-type=module', '-e', `await import('./${cli}'); await import('./${reconciler}');`]);
  assert.equal(hash('remediation/reports/P05/pricing/cost.md'), before);
});

test('current-hosting forecast keeps retained costs and applies January exception honestly', () => {
  run([reconciler, '--prices', prices, '--amendments', amendments, '--output', output]);
  const report = readFileSync(output, 'utf8');
  assert.doesNotMatch(report, /\| Route 53 zone \||\| SES invites \|/);
  assert.match(report, /\| Jan 2027.*\| 130 \|/);
  assert.match(report, /staging: Cloud Map private DNS namespace \(retained\).*0\.50/);
  assert.match(report, /staging: approved HTTPS proxy \(retained while parked\).*7\.00 \|$/m);
  assert.match(report, /staging: RDS t4g.micro.*1\.90 \|$/m);
  assert.match(report, /near-zero|Near-zero/);
  assert.match(report, /P08.10 remains open/);
  const row = report.match(/^\| Jan 2027.*$/m)[0].split('|');
  assert.ok(Number.parseFloat(row[4]) > Number.parseFloat(row[3]));
  assert.ok(Number.parseFloat(row[4]) > 130);
});

test('reconciliation refuses implicit historical snapshots before overwriting output', () => {
  writeFileSync(output, 'sentinel');
  const result = spawnSync(process.execPath, [reconciler, '--output', output]);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(output, 'utf8'), 'sentinel');
});
