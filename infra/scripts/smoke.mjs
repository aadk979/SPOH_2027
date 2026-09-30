/**
 * After a deploy (P08.4, P08.10): the app is up, serves its pages, keeps its API
 * behind sign-in and its readiness probe private.
 *
 *   node infra/scripts/smoke.mjs https://<app url>
 */
const base = process.argv[2]?.replace(/\/$/, '');
if (!base) throw new Error('usage: smoke.mjs <base url>');

const checks = [
  ['liveness', '/healthz', (r) => r.status === 200],
  [
    'the sign-in page',
    '/sign-in',
    async (r) => r.status === 200 && (await r.text()).includes('<html'),
  ],
  // Event screens are one exported placeholder served for every slug (ADR-008 §2).
  ['an event screen, for any event', '/e/smoke-check/map', (r) => r.status === 200],
  // An old screen address is the export's 404 page, which sends the browser on.
  [
    'an old screen address',
    '/map',
    async (r) => r.status === 404 && (await r.text()).includes('<html'),
  ],
  ['the API refuses the signed out', '/api/v1/me', (r) => r.status === 401],
  ['readiness is private', '/readyz', (r) => r.status === 404],
];

let failed = 0;
for (const [name, path, ok] of checks) {
  const response = await fetch(`${base}${path}`, { redirect: 'manual' });
  const passed = await ok(response);
  failed += passed ? 0 : 1;
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name} (${path} → ${response.status})`);
}
process.exit(failed ? 1 : 0);
