#!/usr/bin/env node
/**
 * Architecture guard report: violation counts per rule, never a failure.
 *
 * Two sources, one table, so a phase can show its debt going down:
 *  - the ESLint size and complexity guards (engineering-standards §2),
 *  - the dependency-cruiser boundary rules (§3/§4, .dependency-cruiser.cjs).
 *
 *   npm run arch:report            table
 *   npm run arch:report -- --json  machine-readable, for reports/metrics
 *
 * Exits 0 whatever it finds; the guards are report-only until P06/P07.
 */
import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';

const GUARD_RULES = [
  'max-lines-per-function',
  'max-lines',
  'complexity',
  'max-depth',
  'max-params',
];
const CRUISE_ROOTS = ['server/src', 'client/src', 'packages/shared/src'];

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

async function lintGuardCounts() {
  const results = await new ESLint().lintFiles(['.']);
  const messages = results.flatMap((result) => result.messages);
  const guarded = messages.filter((message) => GUARD_RULES.includes(message.ruleId ?? ''));
  const counts = countBy(guarded, (message) => message.ruleId);
  return Object.fromEntries(GUARD_RULES.map((rule) => [rule, counts[rule] ?? 0]));
}

function boundaryCounts() {
  // The CLI's own entry point under this Node, rather than `npx depcruise`:
  // on Windows npx is npx.cmd, which execFileSync cannot start without a shell.
  const output = execFileSync(
    process.execPath,
    [
      'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
      ...CRUISE_ROOTS,
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'json',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const { summary } = JSON.parse(output);
  const counts = countBy(summary.violations, (violation) => violation.rule.name);
  const rules = summary.ruleSetUsed.forbidden.map((rule) => rule.name);
  return Object.fromEntries(rules.map((rule) => [rule, counts[rule] ?? 0]));
}

function printSection(title, counts) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`\n${title}: ${total}`);
  for (const [rule, n] of Object.entries(counts))
    console.log(`  ${String(n).padStart(4)}  ${rule}`);
}

const report = { size: await lintGuardCounts(), boundaries: boundaryCounts() };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2));
} else {
  printSection('Size and complexity guards (ESLint, warn)', report.size);
  printSection('Module boundaries (dependency-cruiser, warn)', report.boundaries);
}
