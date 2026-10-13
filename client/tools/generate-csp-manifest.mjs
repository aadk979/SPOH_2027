import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { collectExecutableScriptTexts, compareStaticPaths, staticClientCsp, STATIC_MANIFEST_MAX_BYTES, validateStaticClientManifest } from '@spoh/shared/static-client';

export function describeStaticHtml(path, bytes) {
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const errors = [];
  const document = parse(html, { scriptingEnabled: true, onParseError: (error) => errors.push(error.code) });
  if (errors.length) throw new Error('Malformed static HTML');
  const scriptHashes = [...new Set(collectExecutableScriptTexts(document).map((text) =>
    `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`))].sort(compareStaticPaths);
  staticClientCsp({ scriptHashes, apiOrigin: '', mediaOrigin: null });
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
export function generateStaticManifest(exportDirectory) {
  const input = resolve(exportDirectory);
  if (lstatSync(input).isSymbolicLink() || !lstatSync(input).isDirectory()) throw new Error('Static export root must be a regular directory');
  const root = realpathSync(input);
  const documents = exportFiles(root).filter((path) => path.endsWith('.html')).sort(compareStaticPaths)
    .map((path) => describeStaticHtml(path, readFileSync(join(root, path))));
  const manifest = validateStaticClientManifest({ version: 1, documents }, documents);
  const sidecar = `${input}.csp.json`;
  if (existsSync(sidecar) && (!lstatSync(sidecar).isFile() || lstatSync(sidecar).isSymbolicLink()))
    throw new Error('Static manifest must be a regular adjacent file');
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(output) > STATIC_MANIFEST_MAX_BYTES) throw new Error('Static manifest exceeds the size budget');
  const temporary = `${sidecar}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, output, { flag: 'wx' });
    renameSync(temporary, sidecar);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return { documents: documents.length, sidecar };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: generate-csp-manifest.mjs <export directory>');
    process.stdout.write(`${JSON.stringify(generateStaticManifest(process.argv[2]))}\n`);
  } catch { process.stderr.write('Static CSP generation refused\n'); process.exitCode = 1; }
}
