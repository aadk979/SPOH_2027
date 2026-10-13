import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadStaticExport, describeStaticHtml } from '../../src/platform/http/staticClientManifest.js';

const html = '<!doctype html><html><head></head><body><script>\r\nwindow.a="&amp;";\r\n</script></body></html>';
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'spoh-static-pair-')); const root = join(base, 'out'); mkdirSync(root);
  const documents = ['404.html', 'index.html'].map((path) => {
    writeFileSync(join(root, path), html);
    return { path, sha256: createHash('sha256').update(html).digest('hex'), scriptHashes: [`'sha256-${createHash('sha256').update('\nwindow.a="&amp;";\n').digest('base64')}'`] };
  });
  writeFileSync(`${root}.csp.json`, JSON.stringify({ version: 1, documents }));
  return { root, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}
describe('runtime whole-pair verification', () => {
  it('recomputes browser text hashes and retains the exact original bytes', () => {
    const input = fixture();
    try { const loaded = loadStaticExport(input.root); expect(loaded.documents.get('index.html')?.body.toString()).toBe(html); }
    finally { input.cleanup(); }
  });
  it.each(['missing', 'changed-byte', 'changed-hash', 'extra-html', 'missing-html', 'symlink', 'hidden'])('refuses %s before serving', (change) => {
    const input = fixture();
    try {
      const sidecar = `${input.root}.csp.json`;
      if (change === 'missing') rmSync(sidecar);
      if (change === 'changed-byte') writeFileSync(join(input.root, 'index.html'), html.replace('window.a', 'window.b'));
      if (change === 'changed-hash') { const value = JSON.parse(readFileSync(sidecar, 'utf8')) as { documents: { scriptHashes: string[] }[] }; value.documents[0]!.scriptHashes = []; writeFileSync(sidecar, JSON.stringify(value)); }
      if (change === 'extra-html') writeFileSync(join(input.root, 'extra.html'), html);
      if (change === 'missing-html') rmSync(join(input.root, 'index.html'));
      if (change === 'symlink') symlinkSync(input.root, join(input.root, 'linked'), 'junction');
      if (change === 'hidden') writeFileSync(join(input.root, '.secret'), 'private');
      expect(() => loadStaticExport(input.root)).toThrow();
    } finally { input.cleanup(); }
  });
  it('rejects malformed HTML and style/script ambiguity independently of manifest content', () => {
    for (const value of ['<!doctype html><script>unfinished', '<!doctype html><div style="width:1px"></div>', '<!doctype html><svg><script>foreign()</script></svg>'])
      expect(() => describeStaticHtml('index.html', Buffer.from(value))).toThrow();
  });
});
