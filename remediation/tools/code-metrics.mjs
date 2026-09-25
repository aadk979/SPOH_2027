#!/usr/bin/env node
/* eslint-disable no-console -- a CLI report; stdout is its output */
/**
 * Code-size metrics for the remediation programme.
 *
 * Reports every function longer than --fn lines and every file longer than
 * --file lines across server/src, client/src and packages/shared/src, so each
 * phase can show the refactor debt going down rather than asserting it.
 *
 *   node remediation/tools/code-metrics.mjs                 # table
 *   node remediation/tools/code-metrics.mjs --json          # machine-readable
 *   node remediation/tools/code-metrics.mjs --fn 40 --file 250
 *   node remediation/tools/code-metrics.mjs --root ../other-checkout
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const FN_LIMIT = flag('fn', 50);
const FILE_LIMIT = flag('file', 300);
const asJson = args.includes('--json');

const rootArg = args.indexOf('--root');
const root = rootArg === -1 ? fileURLToPath(new URL('../..', import.meta.url)) : args[rootArg + 1];
const roots = ['server/src', 'client/src', 'packages/shared/src'];
/** Generated code is not ours to refactor; counting it would bury the signal. */
const SKIP_DIRS = new Set(['generated', 'node_modules']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function nameOf(node, source) {
  if (node.name) return node.name.getText(source);
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText(source);
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText(source);
  if (parent && ts.isCallExpression(parent)) {
    const callee = parent.expression.getText(source).slice(0, 40);
    return `<callback of ${callee.replace(/\s+/g, ' ')}>`;
  }
  return '<anonymous>';
}

const functions = [];
const files = [];

for (const base of roots) {
  for (const path of walk(join(root, base))) {
    const text = readFileSync(path, 'utf8');
    // Forward slashes on every OS, so snapshots taken on Windows diff cleanly.
    const rel = relative(root, path).split(sep).join('/');
    const lineCount = text.split('\n').length;
    files.push({ file: rel, lines: lineCount });
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      ) {
        const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const lines = end - start + 1;
        if (lines > FN_LIMIT)
          functions.push({ file: rel, line: start, name: nameOf(node, source), lines });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

functions.sort((a, b) => b.lines - a.lines);
const bigFiles = files.filter((f) => f.lines > FILE_LIMIT).sort((a, b) => b.lines - a.lines);
const summary = {
  generatedAt: new Date().toISOString(),
  limits: { functionLines: FN_LIMIT, fileLines: FILE_LIMIT },
  totals: { files: files.length, longFunctions: functions.length, longFiles: bigFiles.length },
  longFunctions: functions,
  longFiles: bigFiles,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`Functions over ${FN_LIMIT} lines: ${functions.length}`);
  for (const f of functions)
    console.log(`  ${String(f.lines).padStart(4)}  ${f.file}:${f.line}  ${f.name}`);
  console.log(`\nFiles over ${FILE_LIMIT} lines: ${bigFiles.length}`);
  for (const f of bigFiles) console.log(`  ${String(f.lines).padStart(4)}  ${f.file}`);
}
