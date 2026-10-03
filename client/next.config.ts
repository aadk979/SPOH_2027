import type { NextConfig } from 'next';

/**
 * Client configuration and security headers (BUILD_PLAN §8.1).
 *
 * The camera permission is granted deliberately: QR scanning for Mission Cards
 * needs it in Phase 3. Geolocation and microphone are denied — nothing in this
 * app has any business with either, and denying them here means a future
 * dependency cannot quietly start asking.
 */
// Server-only destination for the local bootstrap request; absent from static exports.
const apiOrigin = process.env.SPOH_DEV_API_ORIGIN ?? 'http://localhost:4010';
if (new URL(apiOrigin).origin !== apiOrigin || !/^https?:\/\//.test(apiOrigin)) {
  throw new Error('SPOH_DEV_API_ORIGIN must be a canonical HTTP(S) origin');
}
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Names the service worker's cache (F03-036). A deploy may pin it with
 * SPOH_BUILD_ID (the commit); otherwise every `next build` gets a fresh one.
 */
const swVersion = process.env.SPOH_BUILD_ID ?? Date.now().toString(36);

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' is required in both dev and prod: Next's App Router
  // injects inline bootstrap/RSC-payload scripts that a nonce could replace,
  // but only at the cost of forcing every page to dynamic rendering (see
  // Next's CSP guide). 'unsafe-eval' is dev-only — React's dev-mode error
  // reconstruction needs it; neither React nor Next use eval in production.
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
  // Tailwind emits a style element at runtime, and inline `style` attributes
  // carry the design tokens. Styles only — scripts are never inline in prod.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * The container build exports the client as static files for the API to serve
 * on its own origin (ADR-008 §2, P08.4). An export has no server of its own, so
 * the headers below are the API's job there (`platform/http/staticClient.ts`).
 */
const staticExport = process.env.SPOH_STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  ...(staticExport ? { output: 'export' as const } : {}),
  // The floating development badge overlaps the mobile Home tab.
  devIndicators: false,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_SW_VERSION: swVersion },
  poweredByHeader: false,

  ...(staticExport ? {} : { headers, rewrites }),
};

/** Only bootstrap metadata is proxied by the local Next server; operational API calls remain direct. */
async function rewrites() {
  return [{ source: '/api/v1/client-config', destination: `${apiOrigin}/api/v1/client-config` }];
}

async function headers() {
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: 'geolocation=(), microphone=(), camera=(self), payment=()',
        },
        ...(isDev
          ? []
          : [
              {
                key: 'Strict-Transport-Security',
                value: 'max-age=31536000; includeSubDomains',
              },
            ]),
      ],
    },
    {
      // The service worker must never be served from a stale cache, or a
      // fixed bug stays fixed only for people who clear their browser.
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    },
  ];
}

export default nextConfig;
