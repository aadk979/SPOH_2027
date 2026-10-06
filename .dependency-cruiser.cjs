/**
 * Module boundaries: the target architecture from
 * remediation/standards/engineering-standards.md §3 (server) and §4 (client),
 * checked against today's code.
 *
 * Every rule is an error: the server, shared-package and cross-cutting ones
 * since P06.10, the client ones since P07.9. `npm run arch:check` fails on any.
 * A rule whose paths match nothing in today's tree waits for the code it guards.
 *
 *   npm run arch:check      every violation
 *   npm run arch:report     counts per rule (with the ESLint size guards)
 */

/** Server module internals: modules/<domain>/<layer>/… */
const MODULE = '^server/src/modules/[^/]+/';
/** The Prisma client itself: allowed only in data/ and platform/db (ADR-007 §3). */
const PRISMA_CLIENT = ['^server/src/generated/prisma/', '^node_modules/@prisma/'];
/** The client or its wrapper: what http/ and domain/ may not reach at all. */
const PRISMA = [...PRISMA_CLIENT, '^server/src/platform/db/'];
const EXPRESS = ['^node_modules/(@types/)?express(-serve-static-core)?/'];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Deployables (also enforced by ESLint no-restricted-imports) ────────
    {
      name: 'deployable-server-to-client',
      comment: 'The server may never reach into the client deployable.',
      severity: 'error',
      from: { path: '^server/' },
      to: { path: '^client/' },
    },
    {
      name: 'deployable-client-to-server',
      comment: 'The client may never reach into the server deployable.',
      severity: 'error',
      from: { path: '^client/' },
      to: { path: '^server/' },
    },

    // ── Server §3 ──────────────────────────────────────────────────────────
    {
      name: 'server-module-internals-private',
      comment:
        "Another module's internals are private: import its index.ts (public API) only. " +
        'Today every cross-module import is a violation, because no module has an index.ts yet.',
      severity: 'error',
      from: { path: '^server/src/modules/([^/]+)/' },
      to: {
        path: '^server/src/modules/[^/]+/',
        pathNot: ['^server/src/modules/$1/', '^server/src/modules/[^/]+/index[.]ts$'],
      },
    },
    {
      name: 'server-prisma-only-in-data',
      comment:
        'The Prisma client (@prisma/client, the generated client) is imported only by ' +
        'modules/*/data/ and platform/db. A use case opens its transaction through ' +
        'platform/db and passes tx to its repo (ADR-007 §3 prisma-in-data-only).',
      severity: 'error',
      from: {
        path: '^server/src/',
        pathNot: [`${MODULE}data/`, '^server/src/platform/db/'],
      },
      to: { path: PRISMA_CLIENT },
    },
    {
      name: 'server-express-only-in-http',
      comment:
        'Express types and values belong to modules/*/http/ and platform/http only. ' +
        'app/, main.ts and index.ts are the composition root.',
      severity: 'error',
      from: {
        path: '^server/src/',
        pathNot: [
          `${MODULE}http/`,
          '^server/src/platform/http/',
          '^server/src/app/',
          '^server/src/(main|index)[.]ts$',
        ],
      },
      to: { path: EXPRESS },
    },
    {
      name: 'server-http-not-to-data',
      comment: 'http/ calls use cases; it never reaches the data layer or Prisma directly.',
      severity: 'error',
      from: { path: `${MODULE}http/` },
      to: { path: [`${MODULE}data/`, ...PRISMA] },
    },
    {
      name: 'server-application-not-to-http',
      comment: 'Use cases do not know about HTTP.',
      severity: 'error',
      from: { path: `${MODULE}application/` },
      to: { path: [`${MODULE}http/`, ...EXPRESS] },
    },
    {
      name: 'server-domain-is-pure',
      comment:
        'domain/ is pure rules: no I/O, no Prisma, no Express, no other layer, and from ' +
        'platform only the time and errors types.',
      severity: 'error',
      from: { path: `${MODULE}domain/` },
      to: {
        path: [`${MODULE}(http|application|data)/`, '^server/src/platform/', ...PRISMA, ...EXPRESS],
        pathNot: ['^server/src/platform/(time|errors)([.]ts$|/)'],
      },
    },
    {
      name: 'server-data-layer-direction',
      comment: 'data/ depends only on domain types and platform/db.',
      severity: 'error',
      from: { path: `${MODULE}data/` },
      to: {
        path: [`${MODULE}(http|application)/`, '^server/src/platform/'],
        pathNot: ['^server/src/platform/db/'],
      },
    },

    // ── Client §4 ──────────────────────────────────────────────────────────
    {
      name: 'client-api-only-in-feature-api',
      comment:
        'Only features/*/api.ts (and shared/lib) may call the API client. ' +
        'Today that client is lib/api.ts, and pages and hooks call it directly.',
      severity: 'error',
      from: {
        path: '^client/src/',
        pathNot: ['^client/src/features/[^/]+/api[.]ts$', '^client/src/(shared/)?lib/'],
      },
      to: { path: '^client/src/(shared/)?lib/api[.]ts$' },
    },
    {
      name: 'client-features-via-index',
      comment: "A feature imports another feature only through that feature's index.ts.",
      severity: 'error',
      from: { path: '^client/src/features/([^/]+)/' },
      to: {
        path: '^client/src/features/[^/]+/',
        pathNot: ['^client/src/features/$1/', '^client/src/features/[^/]+/index[.]ts$'],
      },
    },
    {
      name: 'client-design-system-no-features',
      comment: 'The design system (shared/ui) never imports a feature. Blocking since P07.9.',
      severity: 'error',
      from: { path: '^client/src/(shared/ui|components/ui)/' },
      to: { path: '^client/src/features/' },
    },

    // ── Shared §5 ──────────────────────────────────────────────────────────
    {
      name: 'shared-stays-leaf',
      comment: '@spoh/shared depends on zod only, never on a deployable.',
      severity: 'error',
      from: { path: '^packages/shared/src/' },
      to: { path: ['^server/', '^client/'] },
    },
    {
      name: 'policy-catalogue-stays-independent',
      comment: 'The policy catalogue cannot depend on a deployable or its generated shared copy.',
      severity: 'error',
      from: { path: '^packages/access-policies/src/' },
      to: { path: ['^server/', '^client/', '^packages/shared/'] },
    },

    // ── Hygiene ────────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      comment: 'Cycles make the module graph impossible to layer.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'An import that does not resolve is a broken build waiting to happen.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],

  options: {
    // Leaves, not sources: dependencies, generated Prisma client and shared's build output.
    doNotFollow: {
      path: ['node_modules', '^server/src/generated/', '^packages/shared/dist/'],
    },
    // Type-only imports are dependencies too: they couple layers just the same.
    tsPreCompilationDeps: true,
    // Resolves the client's "@/…" alias; see the file for why it exists.
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
