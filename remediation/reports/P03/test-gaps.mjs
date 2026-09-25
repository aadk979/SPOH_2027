#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
// P03.6 — test gaps. Run from the repo root:
//
//   (cd server && npx vitest run --coverage --coverage.include='src/**/*.ts' \
//      --coverage.exclude='src/generated/**' --coverage.reporter=json \
//      --coverage.reportsDirectory=/tmp/p03-cov --coverage.thresholds.lines=0 \
//      --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 \
//      --coverage.thresholds.statements=0)
//   node remediation/reports/P03/test-gaps.mjs /tmp/p03-cov/coverage-final.json
//
// Writes test-gaps.json: routes no integration test calls (repro tests do not
// count: they are skipped), server functions no test executes, and client
// screens no e2e spec opens.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const coveragePath = process.argv[2];
if (!coveragePath) {
  console.error('usage: test-gaps.mjs <coverage-final.json>');
  process.exit(2);
}

function walk(dir, match, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match(p)) out.push(p);
  }
  return out;
}

// ── Routes ────────────────────────────────────────────────────────────────
const { endpoints } = JSON.parse(readFileSync('remediation/reports/P02/permissions.json', 'utf8'));
const integration = walk(
  'server/tests/integration',
  (p) => p.endsWith('.test.ts') && !p.includes('/repro/'),
);
const texts = integration.map((file) => ({ file, text: readFileSync(file, 'utf8') }));

function routePattern(method, path) {
  const body = path
    .split('/')
    .map((part) =>
      part.startsWith(':')
        ? '(?:\\$\\{[^}]+\\}|[^/\'"`?]+)'
        : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  // `.post('/api/v1/cards/...`, `.post(\`/api/v1/cards/${code}/stamps\``, or a helper
  // that adds the prefix (`post(person, '/attendance/submit')`): any quoted
  // occurrence of the path counts as a call.
  return new RegExp(`['"\`](?:/api/v1)?${body}(?=['"\`?])`);
}

const routes = endpoints.map((e) => {
  const pattern = routePattern(e.method, e.path);
  const files = texts
    .filter((t) => pattern.test(t.text))
    .map((t) => t.file.replace('server/tests/integration/', ''));
  return {
    method: e.method,
    path: e.path,
    module: e.module,
    capability: e.capability,
    tested: files.length > 0,
    files,
  };
});

// ── Server functions never executed ───────────────────────────────────────
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const unexecuted = [];
for (const [file, data] of Object.entries(coverage)) {
  const rel = file.slice(file.indexOf('server/src/'));
  for (const [id, fn] of Object.entries(data.fnMap)) {
    if (data.f[id] > 0) continue;
    if (fn.name.startsWith('(anonymous')) continue;
    unexecuted.push({ file: rel, line: fn.loc.start.line, name: fn.name });
  }
}
const unitTests = walk('server/tests/unit', (p) => p.endsWith('.test.ts')).map((p) =>
  p.replace('server/', ''),
);

// ── Client screens and e2e ────────────────────────────────────────────────
const pages = walk('client/src/app', (p) => p.endsWith('page.tsx')).map(
  (p) => p.replace('client/src/app', '').replace(/\/page\.tsx$/, '') || '/',
);
const specs = walk('client/tests/e2e', (p) => p.endsWith('.spec.ts')).map((file) => ({
  file: file.replace('client/tests/e2e/', ''),
  text: readFileSync(file, 'utf8'),
}));
const screens = pages.sort().map((route) => {
  const files = specs
    // A `goto('/x')`, a `waitForURL('**/x')` or a URL assertion all count.
    .filter(
      (s) =>
        route !== '/' &&
        new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-])`).test(s.text),
    )
    .map((s) => s.file);
  return { route, e2e: files };
});

const result = {
  generatedAt: new Date().toISOString(),
  routes: { total: routes.length, untested: routes.filter((r) => !r.tested).length, list: routes },
  serverFunctions: { unexecuted: unexecuted.length, list: unexecuted },
  unitTestFiles: unitTests,
  screens: {
    total: screens.length,
    withoutE2e: screens.filter((s) => s.e2e.length === 0).length,
    list: screens,
  },
};
writeFileSync('remediation/reports/P03/test-gaps.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `routes ${routes.length}, untested ${result.routes.untested}; ` +
    `server functions never executed ${unexecuted.length}; ` +
    `screens ${screens.length}, without e2e ${result.screens.withoutE2e}`,
);
