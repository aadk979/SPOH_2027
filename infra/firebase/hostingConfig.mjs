/** Firebase's static destinations preserve the export's event placeholder and RSC payloads. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function requestPath(file) {
  const path = `/${file}`;
  if (path === '/index.html') return '/';
  if (path.endsWith('.html')) return path.slice(0, -5);
  // Next requests dot-joined payloads; its export writes the corresponding folders.
  return path.replace(
    /\/(__next\.[^/]+)\/(.+)\.txt$/,
    (_, first, rest) => `/${first}.${rest.replaceAll('/', '.')}.txt`,
  );
}

function requestRegex(file) {
  return `^${escapeRegex(requestPath(file))
    .replace(/^\/e\/_\//, '/e/[^/]+/')
    .replace(escapeRegex('$d$event'), '(?:\\$d\\$event|[^/.]+)')}$`;
}

export function exportRewrites(files) {
  return files
    .filter((file) => /\.(html|txt)$/.test(file) && file !== '404.html')
    .sort()
    .map((file) => ({ regex: requestRegex(file), destination: `/${file}` }));
}

function securityHeaders(apiOrigin) {
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: policy },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'geolocation=(), microphone=(), camera=(self), payment=()',
    },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'Cache-Control', value: 'no-cache' },
  ];
}

export function hostingConfig(files, runtime) {
  return {
    hosting: {
      target: 'client',
      public: 'public',
      ignore: ['**/.*', '**/node_modules/**'],
      cleanUrls: true,
      trailingSlash: false,
      rewrites: [
        { source: '/api/v1/client-config', destination: '/client-config.json' },
        ...exportRewrites(files),
      ],
      headers: [
        { source: '**', headers: securityHeaders(runtime.apiBaseUrl) },
        {
          source: '/_next/static/**',
          headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
        },
        {
          source: '/sw.js',
          headers: [{ key: 'Cache-Control', value: 'no-store' }],
        },
        ...['/client-config.json', '/api/v1/client-config'].map((source) => ({
          source,
          headers: [
            { key: 'Cache-Control', value: 'no-store' },
            { key: 'Content-Type', value: 'application/json; charset=utf-8' },
          ],
        })),
      ],
    },
  };
}
