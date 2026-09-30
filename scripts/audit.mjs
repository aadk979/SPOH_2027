#!/usr/bin/env node
/**
 * Dependency audit gate (BUILD_PLAN §8.6): fails on any high or critical
 * advisory, except one listed in `audit-exceptions.json` for the exact install
 * paths it names and until its expiry. An advisory the exception does not
 * name, a path it does not name, or an expired exception all fail the build,
 * so an exception cannot quietly widen or outlive its reason.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const exceptions = JSON.parse(
  readFileSync(new URL('./audit-exceptions.json', import.meta.url), 'utf8'),
).exceptions;

function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // npm audit exits non-zero whenever it finds anything; the JSON is still on stdout.
    if (typeof error.stdout === 'string' && error.stdout.trim()) return error.stdout;
    throw error;
  }
}

const advisoryId = (via) => via.url.split('/').pop();

function problemsWith(name, vulnerability, today) {
  if (!BLOCKING.has(vulnerability.severity)) return [];
  const advisories = vulnerability.via.filter((via) => typeof via === 'object');
  const exception = exceptions.find((entry) => entry.package === name);
  if (!exception) return [`${name}: ${vulnerability.severity}, no exception`];
  if (exception.expires < today) return [`${name}: exception expired on ${exception.expires}`];
  const problems = [];
  for (const node of vulnerability.nodes) {
    if (!exception.paths.includes(node)) problems.push(`${name}: path ${node} is not excepted`);
  }
  for (const via of advisories) {
    if (BLOCKING.has(via.severity) && !exception.advisories.includes(advisoryId(via))) {
      problems.push(`${name}: advisory ${advisoryId(via)} is not excepted`);
    }
  }
  return problems;
}

const report = JSON.parse(runAudit());
const today = new Date().toISOString().slice(0, 10);
const problems = Object.entries(report.vulnerabilities ?? {}).flatMap(([name, vulnerability]) =>
  problemsWith(name, vulnerability, today),
);

if (problems.length > 0) {
  console.error('Dependency audit failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const excepted = Object.entries(report.vulnerabilities ?? {}).filter(([, v]) =>
  BLOCKING.has(v.severity),
);
for (const [name] of excepted) {
  const exception = exceptions.find((entry) => entry.package === name);
  console.log(`audit: ${name} excepted until ${exception.expires} (${exception.reason})`);
}
console.log('audit: no unexcepted high or critical advisories');
