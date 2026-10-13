import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'parse5';
import { collectExecutableScriptTexts, compareStaticPaths, STATIC_MANIFEST_MAX_BYTES,
  validateStaticClientManifest, type StaticDocument } from '@spoh/shared/static-client';

export interface VerifiedStaticDocument { metadata: StaticDocument; body: Buffer }
export interface VerifiedStaticExport { root: string; files: ReadonlySet<string>; documents: ReadonlyMap<string, VerifiedStaticDocument> }
export function describeStaticHtml(path: string, bytes: Uint8Array): StaticDocument {
  const document = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), {
    scriptingEnabled: true, onParseError: () => { throw new Error('Malformed static HTML'); },
  });
  const scriptHashes = [...new Set(collectExecutableScriptTexts(document).map((text) =>
    `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`))].sort(compareStaticPaths);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), scriptHashes };
}
function exportFiles(root: string, prefix = ''): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) throw new Error('Hidden files and symlinks are not static export inputs');
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return exportFiles(root, path);
    if (!entry.isFile()) throw new Error('Static export inputs must be regular files');
    return [path];
  });
}
/** Load once, recompute every document/hash, and retain the verified bytes used for responses. */
export function loadStaticExport(exportDirectory: string): VerifiedStaticExport {
  const input = resolve(exportDirectory);
  const rootStat = lstatSync(input);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Static export root must be a regular directory');
  const sidecar = `${input}.csp.json`;
  const sidecarStat = lstatSync(sidecar);
  if (!sidecarStat.isFile() || sidecarStat.isSymbolicLink() || sidecarStat.size > STATIC_MANIFEST_MAX_BYTES)
    throw new Error('Invalid adjacent static manifest');
  const root = realpathSync(input);
  const files = exportFiles(root).sort(compareStaticPaths);
  const entries = files.filter((path) => path.endsWith('.html')).map((path) => {
    const body = readFileSync(join(root, path));
    return { metadata: describeStaticHtml(path, body), body };
  });
  validateStaticClientManifest(JSON.parse(readFileSync(sidecar, 'utf8')), entries.map((entry) => entry.metadata));
  return { root, files: new Set(files), documents: new Map(entries.map((entry) => [entry.metadata.path, entry])) };
}
