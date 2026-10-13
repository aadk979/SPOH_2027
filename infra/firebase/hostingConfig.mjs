import { StaticClientManifestSchema, staticClientCsp, validateStaticHeaderBudget } from '@spoh/shared/static-client';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function requestPath(file) {
  const path = `/${file}`;
  if (path === '/index.html') return '/';
  if (path.endsWith('.html')) return path.slice(0, -5);
  return path.replace(/\/(__next\.[^/]+)\/(.+)\.txt$/, (_, first, rest) => `/${first}.${rest.replaceAll('/', '.')}.txt`);
}
function aliasPattern(path) {
  return escapeRegex(path).replace(/^\/e\/_\//, '/e/[^/]+/')
    .replace(escapeRegex('$d$event'), '(?:\\$d\\$event|[^/.]+)');
}
export function requestRegex(file) { return `^${aliasPattern(requestPath(file))}$`; }
/** Header matching precedes rewrites: clean/requested aliases AND physical addresses are covered. */
export function headerRequestRegex(file) {
  const paths = new Set([requestPath(file), `/${file}`]);
  if (file === 'index.html') paths.add('/index');
  return `^(?:${[...paths].map(aliasPattern).join('|')})$`;
}
export function exportRewrites(files) {
  return files.filter((file) => /\.(html|txt)$/.test(file) && file !== '404.html').sort()
    .map((file) => ({ regex: requestRegex(file), destination: `/${file}` }));
}
function securityHeaders() {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(self), payment=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'Cache-Control', value: 'no-cache' },
  ];
}
const csp = (value) => {
  validateStaticHeaderBudget(Object.fromEntries([...securityHeaders(), { key: 'Content-Security-Policy', value }].map((header) => [header.key, header.value])));
  return { key: 'Content-Security-Policy', value };
};
function policyHeaders(files, runtime, rawManifest) {
  const manifest = StaticClientManifestSchema.parse(rawManifest);
  const html = files.filter((file) => file.endsWith('.html')).sort();
  if (JSON.stringify(html) !== JSON.stringify(manifest.documents.map((document) => document.path)))
    throw new Error('Static manifest does not cover the hosting HTML inventory');
  const input = { apiOrigin: runtime.apiBaseUrl, mediaOrigin: runtime.mediaOrigin };
  const hashes = new Map(manifest.documents.map((document) => [document.path, document.scriptHashes]));
  const ordinary = files.map((file) => ({
    regex: headerRequestRegex(file), headers: [csp(staticClientCsp({ ...input, scriptHashes: hashes.get(file) ?? [] }))],
  }));
  // Firebase applies this special source to its actual custom 404 response, regardless of request URL.
  return [...ordinary, { source: '404.html', headers: [csp(staticClientCsp({ ...input, scriptHashes: hashes.get('404.html') })),
    { key: 'Cache-Control', value: 'no-cache' }] }];
}
export function hostingConfig(files, runtime, manifest) {
  const bootstrapPolicy = staticClientCsp({ scriptHashes: [], apiOrigin: runtime.apiBaseUrl, mediaOrigin: runtime.mediaOrigin });
  return { hosting: { target: 'client', public: 'public', ignore: ['**/.*', '**/node_modules/**'],
    cleanUrls: true, trailingSlash: false,
    rewrites: [{ source: '/api/v1/client-config', destination: '/client-config.json' }, ...exportRewrites(files)],
    headers: [
      { source: '**', headers: securityHeaders() },
      { source: '/_next/static/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      ...['/client-config.json', '/api/v1/client-config'].map((source) => ({ source, headers: [
        { key: 'Cache-Control', value: 'no-store' }, { key: 'Content-Type', value: 'application/json; charset=utf-8' }, csp(bootstrapPolicy),
      ] })),
      ...policyHeaders(files, runtime, manifest),
    ],
  } };
}
