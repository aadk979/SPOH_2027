import type { NextConfig } from 'next';

/**
 * Client configuration and security headers (BUILD_PLAN §8.1).
 *
 * The camera permission is granted deliberately: QR scanning for Mission Cards
 * needs it in Phase 3. Geolocation and microphone are denied — nothing in this
 * app has any business with either, and denying them here means a future
 * dependency cannot quietly start asking.
 */
const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4010';
const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  // No 'unsafe-eval' anywhere. In development Next's fast refresh needs
  // 'unsafe-inline' for its injected bootstrap; production does not.
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
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
  },
};

export default nextConfig;
