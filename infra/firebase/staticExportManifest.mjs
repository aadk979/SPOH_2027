import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'parse5';
import { collectExecutableScriptTexts, compareStaticPaths, STATIC_MANIFEST_MAX_BYTES, validateStaticClientManifest } from '@spoh/shared/static-client';

export function describeStaticHtml(path, bytes) {
  const errors = [];
  const document = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), {
    scriptingEnabled: true, onParseError: (error) => errors.push(error.code),
  });
  if (errors.length) throw new Error('Malformed static HTML');
  const scriptHashes = [...new Set(collectExecutableScriptTexts(document).map((text) =>
    `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`))].sort(compareStaticPaths);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), scriptHashes };
}
function exportFiles(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) throw new Error('Hidden files and symlinks are not static export inputs');
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return exportFiles(root, path);
    if (!entry.isFile()) throw new Error('Static export inputs must be regular files');
    return [path];
  });
}
/** The adjacent sidecar is private input, never copied into Firebase's public directory. */
export function loadStaticExport(exportDirectory) {
  const input = resolve(exportDirectory);
  const rootStat = lstatSync(input);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Static export root must be a regular directory');
  const sidecar = `${input}.csp.json`;
  const stat = lstatSync(sidecar);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > STATIC_MANIFEST_MAX_BYTES) throw new Error('Invalid adjacent static manifest');
  const root = realpathSync(input);
  const files = exportFiles(root).sort(compareStaticPaths);
  const documents = files.filter((path) => path.endsWith('.html')).map((path) => describeStaticHtml(path, readFileSync(join(root, path))));
  const manifest = validateStaticClientManifest(JSON.parse(readFileSync(sidecar, 'utf8')), documents);
  return { root, files, manifest };
}
