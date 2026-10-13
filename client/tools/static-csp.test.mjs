import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { describeStaticHtml, generateStaticManifest } from './generate-csp-manifest.mjs';

const hash = (value) => `'sha256-${createHash('sha256').update(value, 'utf8').digest('base64')}'`;
const document = (body) => `<!doctype html><html><head></head><body>${body}</body></html>`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'spoh-static-generator-'));
  const out = join(root, 'out'); mkdirSync(out);
  for (const file of ['404.html', 'index.html', '_not-found.html']) writeFileSync(join(out, file), document(`<script>self.page=${JSON.stringify(file)}</script>`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return out;
}
test('hashes browser-normalized executable text without trimming or entity decoding', () => {
  const html = document('<script>\r\nwindow.value="&amp;";\rnext();\r\n</script><script type="module">module();</script>' +
    '<script type=" APPLICATION/JAVASCRIPT ;charset=utf-8">classic();</script><script type="importmap">{}</script>' +
    '<script type="speculationrules">{"prefetch":[]}</script><script type="application/json">{"inert":true}</script>' +
    '<script src="/external.js">ignored()</script><template><script>inert()</script></template><noscript><script>inert()</script></noscript>');
  const observed = describeStaticHtml('index.html', Buffer.from(html));
  assert.deepEqual(observed.scriptHashes, [hash('\nwindow.value="&amp;";\nnext();\n'), hash('module();'), hash('classic();'), hash('{}'), hash('{"prefetch":[]}')].sort());
  assert.equal(observed.sha256, createHash('sha256').update(html).digest('hex'));
  assert.notEqual(observed.sha256, createHash('sha256').update(html.replaceAll('\r\n', '\n')).digest('hex'));
});
test('deduplicates identical scripts and distinguishes changed document payloads', () => {
  const one = describeStaticHtml('index.html', Buffer.from(document('<script>one()</script><script>one()</script>')));
  const two = describeStaticHtml('index.html', Buffer.from(document('<script>two()</script>')));
  assert.deepEqual(one.scriptHashes, [hash('one()')]); assert.notDeepEqual(one.scriptHashes, two.scriptHashes);
});
test('refuses inline CSS/event handlers, malformed UTF-8/HTML and unsupported foreign scripts', () => {
  for (const value of ['<div style="color:red"></div>', '<style>body{color:red}</style>', '<button onclick="evil()"></button>', '<svg><script>evil()</script></svg>'])
    assert.throws(() => describeStaticHtml('index.html', Buffer.from(document(value))));
  assert.throws(() => describeStaticHtml('index.html', Buffer.from([255])));
  assert.throws(() => describeStaticHtml('index.html', Buffer.from('<!doctype html><script>unfinished')));
});
test('writes the complete adjacent sidecar while preserving every exported byte', (t) => {
  const out = fixture(t); const before = readFileSync(join(out, 'index.html'));
  const result = generateStaticManifest(out);
  assert.equal(result.sidecar, `${out}.csp.json`);
  const manifest = JSON.parse(readFileSync(result.sidecar, 'utf8'));
  assert.deepEqual(manifest.documents.map((entry) => entry.path), ['404.html', '_not-found.html', 'index.html']);
  assert.deepEqual(readFileSync(join(out, 'index.html')), before);
  assert.equal(manifest.documents.every((entry) => entry.scriptHashes.length === 1), true);
});
test('rejects hidden/symlink/missing documents and oversized per-document policies', (t) => {
  const out = fixture(t); writeFileSync(join(out, '.hidden'), 'private');
  assert.throws(() => generateStaticManifest(out), /Hidden/); rmSync(join(out, '.hidden'));
  symlinkSync(out, join(out, 'linked'), 'junction'); assert.throws(() => generateStaticManifest(out), /symlink/); rmSync(join(out, 'linked'));
  rmSync(join(out, '404.html')); assert.throws(() => generateStaticManifest(out));
  const scripts = Array.from({ length: 129 }, (_, index) => `<script>window.n=${index}</script>`).join('');
  assert.throws(() => describeStaticHtml('index.html', Buffer.from(document(scripts))));
});
