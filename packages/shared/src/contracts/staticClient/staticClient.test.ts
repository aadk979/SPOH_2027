import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { staticClientCsp, validateStaticClientManifest, StaticClientManifestSchema, isStaticMediaOrigin, validateStaticHeaderBudget } from './index.js';

const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const documents = ['404.html', 'index.html'].map((path) => ({ path, sha256: 'a'.repeat(64), scriptHashes: [hash(path)] }));
describe('the exact static export contract', () => {
  it('requires full matching byte and executable-script observations', () => {
    const manifest = { version: 1, documents };
    expect(validateStaticClientManifest(manifest, documents)).toEqual(manifest);
    expect(() => validateStaticClientManifest(manifest, documents.slice(1))).toThrow();
    expect(() => validateStaticClientManifest(manifest, documents.map((value) => ({ ...value, sha256: 'b'.repeat(64) })))).toThrow();
    expect(() => validateStaticClientManifest(manifest, documents.map((value) => ({ ...value, scriptHashes: [] })))).toThrow();
  });
  it.each(['/outside.html', '../index.html', 'a/../index.html', '.hidden/index.html', 'a\\index.html', 'a%2findex.html', 'index.html?x', 'payload.txt', 'C:index.html'])('refuses ambiguous or escaping document path %s', (path) => {
    expect(StaticClientManifestSchema.safeParse({ version: 1, documents: [{ ...documents[0], path }, documents[1]] }).success).toBe(false);
  });
  it('refuses duplicates, unsorted entries, unsupported fields/versions and hash tokens', () => {
    for (const documentsOf of [[...documents].reverse(), [documents[0], documents[0], documents[1]],
      documents.map((value) => ({ ...value, scriptHashes: [hash('same'), hash('same')] })),
      documents.map((value) => ({ ...value, scriptHashes: ["'unsafe-inline'"] }))])
      expect(StaticClientManifestSchema.safeParse({ version: 1, documents: documentsOf }).success).toBe(false);
    expect(StaticClientManifestSchema.safeParse({ version: 2, documents }).success).toBe(false);
    expect(StaticClientManifestSchema.safeParse({ version: 1, documents, secret: 'private' }).success).toBe(false);
  });
  it('refuses noncanonical base64 pad bits in a digest token', () => {
    const scriptHashes = [`'sha256-${'A'.repeat(42)}B='`];
    expect(StaticClientManifestSchema.safeParse({ version: 1,
      documents: documents.map((document) => ({ ...document, scriptHashes })) }).success).toBe(false);
    expect(() => staticClientCsp({ scriptHashes, apiOrigin: '', mediaOrigin: null })).toThrow();
  });
});
describe('a bounded per-document policy', () => {
  const mediaOrigin = 'https://synthetic-media.s3.ap-southeast-1.amazonaws.com';
  it('permits exact public resource origins only in the required directives', () => {
    const policy = staticClientCsp({ scriptHashes: [hash('index')], apiOrigin: 'https://api.example.test', mediaOrigin });
    expect(policy).toContain(`script-src 'self' ${hash('index')};`);
    expect(policy).toContain("style-src 'self' https://api.example.test;");
    expect(policy).toContain("manifest-src 'self' https://api.example.test;");
    expect(policy).toContain("worker-src 'self';");
    expect(policy).toContain("script-src-attr 'none';"); expect(policy).toContain("style-src-attr 'none';");
    expect(policy).not.toMatch(/unsafe-|nonce-|\*/);
    const scriptDirective = policy.split(';').map((value) => value.trim()).find((value) => value.startsWith('script-src '));
    expect(scriptDirective).toBeDefined();
    expect(scriptDirective).not.toContain(mediaOrigin);
    expect(staticClientCsp({ scriptHashes: [], apiOrigin: '', mediaOrigin: null })).not.toContain('sha256-');
  });
  it.each(['https://api.test/path', 'https://api.test; script-src *', 'https://user:pass@api.test', 'https://API.test', 'https://api.test:443'])('refuses invalid API origin %s', (apiOrigin) => {
    expect(() => staticClientCsp({ scriptHashes: [], apiOrigin, mediaOrigin: null })).toThrow();
  });
  it.each(['https://anything.example', 'https://a.b.s3.ap-southeast-1.amazonaws.com', 'https://synthetic.s3.cn-north-1.amazonaws.com', 'https://*.amazonaws.com'])('refuses an arbitrary media origin %s', (media) => expect(isStaticMediaOrigin(media)).toBe(false));
  it('enforces the full serialized budget after adding actual runtime origins', () => {
    const scriptHashes = Array.from({ length: 128 }, (_, index) => hash(String(index))).sort();
    expect(() => staticClientCsp({ scriptHashes, apiOrigin: `https://${'a'.repeat(1800)}.test`, mediaOrigin: null })).toThrow('8 KiB');
  });
});

describe('the aggregate custom response header budget', () => {
  it('counts UTF-8, repeated fields and formatting bytes without host globals', () => {
    expect(() => validateStaticHeaderBudget({ 'Content-Security-Policy': "default-src 'self'", Vary: ['Origin', 'Accept-Encoding'] })).not.toThrow();
    expect(() => validateStaticHeaderBudget({ X: 'x'.repeat(9200) })).not.toThrow();
    expect(() => validateStaticHeaderBudget({ X: 'x'.repeat(9212) })).toThrow('9 KiB');
    expect(() => validateStaticHeaderBudget({ X: '😀'.repeat(2303) })).toThrow('9 KiB');
  });
});
