#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
// P03.8 — which server modules and client files use each shared contract.
// Run from the repo root: node remediation/reports/P03/shared-map.mjs
// Writes shared-map.json: per shared file, its exports and, per export, the
// server modules and client areas that name it.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (p.includes('node_modules') || p.includes('/generated')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const shared = walk('packages/shared/src').filter((p) => !p.endsWith('index.ts'));
const server = walk('server/src').map((p) => ({ p, t: readFileSync(p, 'utf8') }));
const client = walk('client/src').map((p) => ({ p, t: readFileSync(p, 'utf8') }));

const serverArea = (p) =>
  p.match(/server\/src\/modules\/([^/]+)/)?.[1] ?? p.replace('server/src/', '').split('/')[0];
const clientArea = (p) => p.replace('client/src/', '').split('/').slice(0, 2).join('/');

const result = shared.map((file) => {
  const text = readFileSync(file, 'utf8');
  const names = [...text.matchAll(/^export (?:const|type|interface|function|enum) (\w+)/gm)].map(
    (m) => m[1],
  );
  const exports = [...new Set(names)].map((name) => {
    const re = new RegExp(`\\b${name}\\b`);
    return {
      name,
      server: [...new Set(server.filter((f) => re.test(f.t)).map((f) => serverArea(f.p)))].sort(),
      client: [...new Set(client.filter((f) => re.test(f.t)).map((f) => clientArea(f.p)))].sort(),
    };
  });
  return {
    file: file.replace('packages/shared/src/', ''),
    exports,
    serverModules: [...new Set(exports.flatMap((e) => e.server))].sort(),
    clientAreas: [...new Set(exports.flatMap((e) => e.client))].sort(),
    unused: exports
      .filter((e) => e.server.length === 0 && e.client.length === 0)
      .map((e) => e.name),
  };
});

writeFileSync('remediation/reports/P03/shared-map.json', `${JSON.stringify(result, null, 2)}\n`);
for (const r of result) {
  console.log(
    `${r.file}: ${r.exports.length} exports; server ${r.serverModules.join(',') || '—'}; client ${r.clientAreas.length} areas; unused ${r.unused.length}`,
  );
}
