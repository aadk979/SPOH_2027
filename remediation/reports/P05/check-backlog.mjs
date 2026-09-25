#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Proves that findings/BACKLOG.md gives every finding a home.
 *
 *   node remediation/reports/P05/check-backlog.mjs
 *
 * 1. Collects every finding ID filed in preliminary.md and F01–F04 (headings, and the F01
 *    inventory table rows).
 * 2. Reads BACKLOG.md's tables: the ranked sections (Blocker, High, Medium, Low), the
 *    "Closed before P05" table and the F01 inventory table.
 * 3. Fails if an ID has no row, if an ID has more than one ranked row, or if a Home cell names a
 *    step that progress.json does not know.
 * 4. Prints the counts per severity that the backlog's headline quotes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FINDINGS = join(ROOT, 'findings');
const SOURCES = [
  'preliminary',
  'F01-hardcoding',
  'F02-journeys',
  'F03-code-quality',
  'F04-security-ops',
];
const ID = /(?:PF-\d{2}|F0[1-4]-\d{3})/g;

function filedIds() {
  const ids = new Set();
  for (const name of SOURCES) {
    const text = readFileSync(join(FINDINGS, `${name}.md`), 'utf8');
    for (const m of text.matchAll(/^#{3,4} ((?:PF-\d{2}|F0[1-4]-\d{3})) — /gm)) ids.add(m[1]);
    for (const m of text.matchAll(/^\| (F01-\d{3}) \|/gm)) ids.add(m[1]);
  }
  return ids;
}

function knownSteps() {
  const progress = JSON.parse(readFileSync(join(ROOT, 'progress.json'), 'utf8'));
  return new Set(progress.phases.flatMap((p) => p.steps.map((s) => s.id)));
}

function sections(text) {
  const out = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = line.match(/^#{2,3} (.+)$/);
    if (heading) current = heading[1].trim();
    else if (current && line.startsWith('| ') && !/^\| -/.test(line)) {
      if (!out.has(current)) out.set(current, []);
      out.get(current).push(
        line
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      );
    }
  }
  return out;
}

function main() {
  const text = readFileSync(join(FINDINGS, 'BACKLOG.md'), 'utf8');
  const tables = sections(text);
  const steps = knownSteps();
  const errors = [];
  const ranked = new Map();
  const counts = {};

  for (const severity of ['Blocker', 'High', 'Medium', 'Low']) {
    const rows = (tables.get(severity) ?? []).slice(1);
    counts[severity] = { rows: rows.length, unique: 0 };
    for (const [id, , home, also] of rows) {
      if (ranked.has(id)) errors.push(`${id}: ranked twice (${ranked.get(id)} and ${severity})`);
      ranked.set(id, severity);
      if (!steps.has(home)) errors.push(`${id}: home "${home}" is not a step in progress.json`);
      if (!/_umbrella_|_see_/.test(also)) counts[severity].unique += 1;
    }
  }

  const closed = new Set((tables.get('Closed before P05') ?? []).slice(1).map((r) => r[0]));
  const inventory = new Set();
  for (const [items, , home] of (
    tables.get('F01 inventory (every hardcoded value, with its class)') ?? []
  ).slice(1)) {
    for (const id of items.match(ID) ?? []) inventory.add(id);
    if (!steps.has(home)) errors.push(`${items}: home "${home}" is not a step in progress.json`);
  }

  for (const id of filedIds()) {
    const homes = [ranked.has(id), closed.has(id), inventory.has(id)].filter(Boolean).length;
    if (homes === 0) errors.push(`${id}: filed but has no row in BACKLOG.md`);
  }

  const open = Object.values(counts).reduce((n, c) => n + c.unique, 0);
  const rows = Object.values(counts).reduce((n, c) => n + c.rows, 0);
  console.log(`filed IDs: ${filedIds().size}`);
  console.log(
    `ranked rows: ${rows} (unique open findings: ${open}), closed: ${closed.size}, F01 inventory: ${inventory.size}`,
  );
  for (const [severity, c] of Object.entries(counts)) {
    console.log(
      `  ${severity.padEnd(8)} ${String(c.rows).padStart(3)} rows, ${String(c.unique).padStart(3)} unique`,
    );
  }
  if (errors.length > 0) {
    console.log(`\n${errors.length} problem(s):`);
    for (const e of errors) console.log(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log('\n✓ every filed finding has a home');
}

main();
