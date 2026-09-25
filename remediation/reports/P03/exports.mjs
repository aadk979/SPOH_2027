/* eslint-disable no-console -- a CLI; stdout is its interface */
// Lists every exported declaration in server/src (excluding generated/), one TSV row each:
// file, line, kind, name, lines. Used by module-map.mjs; run from the repo root.
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (p.includes('/generated')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts'))
      out.push(p);
  }
  return out;
}

const isExported = (n) => ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export;

function kindOf(node) {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return 'type';
  if (ts.isEnumDeclaration(node)) return 'enum';
  return 'const';
}

export function exportsOf(file) {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const rows = [];
  const lineOf = (n) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const endOf = (n) => src.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
  for (const st of src.statements) {
    if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        const fn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        rows.push({
          file,
          line: lineOf(d),
          kind: fn ? 'function' : 'const',
          name: d.name.getText(src),
          lines: endOf(d) - lineOf(d) + 1,
        });
      }
    } else if (
      (ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st) ||
        ts.isEnumDeclaration(st)) &&
      isExported(st) &&
      st.name
    ) {
      rows.push({
        file,
        line: lineOf(st),
        kind: kindOf(st),
        name: st.name.text,
        lines: endOf(st) - lineOf(st) + 1,
      });
    } else if (
      ts.isExportDeclaration(st) &&
      st.exportClause &&
      ts.isNamedExports(st.exportClause)
    ) {
      for (const e of st.exportClause.elements)
        rows.push({ file, line: lineOf(e), kind: 're-export', name: e.name.text, lines: 1 });
    } else if (ts.isExportAssignment(st)) {
      rows.push({
        file,
        line: lineOf(st),
        kind: 'default',
        name: 'default',
        lines: endOf(st) - lineOf(st) + 1,
      });
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of walk('server/src'))
    for (const r of exportsOf(f)) console.log([r.file, r.line, r.kind, r.name, r.lines].join('\t'));
}
