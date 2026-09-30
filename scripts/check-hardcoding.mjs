#!/usr/bin/env node
/**
 * No event-specific literal in source (engineering-standards §6, P09.11).
 *
 * Fails on the F01 patterns — calendar dates, the venue and brand, course
 * codes, timezone names — in the product source of the server, the client and
 * the shared package. Events, days, stations and zones are data; a literal of
 * one of them in `src/` ties the platform to one event again.
 *
 * Out of scope, as F01 classifies them: tests and fixtures, generated code,
 * and the seed (a development fixture generator, outside `src/`). A line that
 * must keep such a literal carries `hardcoding-allowed: <reason>` in a comment
 * on the line itself or the line above, and a file of event content awaiting
 * its move to data carries `hardcoding-allowed-file: <reason>` near its top;
 * reviewers treat each one as a question.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SCOPE = ['server/src', 'client/src', 'packages/shared/src'];
const EXCLUDED = [
  /(^|\/)generated\//,
  /\.test\.(ts|tsx|mjs)$/,
  /(^|\/)(tests?|__tests__|fixtures?)\//,
  /\.d\.ts$/,
];
const SOURCE = /\.(ts|tsx|mjs|js)$/;

export const PATTERNS = [
  { name: 'calendar date', pattern: /\b20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/ },
  {
    name: 'venue or brand',
    // The workspace packages are @spoh/*: a package name, not the event.
    pattern:
      /(?<![@\w])SPOH\b|(?<![@\w])spoh[-_]?20\d\d\b|\bT19\b|School of Computing|Singapore Polytechnic|\bOpen House\b/i,
  },
  { name: 'course code', pattern: /\b(DAAA|DCDF|DCITP|DCS)\b/ },
  {
    name: 'timezone name',
    pattern:
      /\b(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Z][A-Za-z_]+|\bSGT\b/,
  },
];

const ALLOW = /hardcoding-allowed:\s*\S/;
/** A whole file of event content awaiting its move to data, with the reason. */
const ALLOW_FILE = /hardcoding-allowed-file:\s*\S/;

function trackedFiles() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...SCOPE], { encoding: 'utf8' });
  return listed
    .split('\0')
    .filter((file) => SOURCE.test(file) && !EXCLUDED.some((rule) => rule.test(file)));
}

/** Every offending line of one file, with the pattern it matched. */
export function findingsIn(file, text) {
  const lines = text.split('\n');
  if (lines.slice(0, 15).some((line) => ALLOW_FILE.test(line))) return [];
  return lines.flatMap((line, index) => {
    const hit = PATTERNS.find(({ pattern }) => pattern.test(line));
    if (!hit) return [];
    if (ALLOW.test(line) || ALLOW.test(lines[index - 1] ?? '')) return [];
    return [`${file}:${index + 1}: ${hit.name}: ${line.trim().slice(0, 140)}`];
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const findings = trackedFiles().flatMap((file) => findingsIn(file, readFileSync(file, 'utf8')));
  if (findings.length > 0) {
    console.error(`Event-specific literals in source (${findings.length}):`);
    for (const finding of findings) console.error(`  ${finding}`);
    process.exit(1);
  }
  console.log('check:hardcoding: no event-specific literals in source');
}
