/**
 * Module boundaries: the target architecture from
 * remediation/standards/engineering-standards.md §3 (server) and §4 (client),
 * checked against today's code.
 *
 * Report-only: every rule is a warning, so `npm run arch:check` lists the
 * distance to the target without failing. P06/P07 flip these to errors once
 * the refactor has brought them to zero. Paths not yet in the tree (http/,
 * application/, platform/, shared/ui/ …) match nothing until the refactor
 * creates them; where today's layout has an equivalent it is named too, so the
 * current debt is counted rather than hidden.
 *
 *   npm run arch:check      every violation
 *   npm run arch:report     counts per rule (with the ESLint size guards)
 */

/** Server module internals: modules/<domain>/<layer>/… */
const MODULE = '^server/src/modules/[^/]+/';
const PRISMA = [
  '^server/src/generated/prisma/',
  '^server/src/platform/db/',
  '^node_modules/@prisma/',
];
const EXPRESS = ['^node_modules/(@types/)?express(-serve-static-core)?/'];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Deployables (also enforced by ESLint no-restricted-imports) ────────
    {
      name: 'deployable-server-to-client',
      comment: 'The server may never reach into the client deployable.',
      severity: 'warn',
      from: { path: '^server/' },
      to: { path: '^client/' },
    },
    {
      name: 'deployable-client-to-server',
      comment: 'The client may never reach into the server deployable.',
      severity: 'warn',
      from: { path: '^client/' },
      to: { path: '^server/' },
    },

    // ── Server §3 ──────────────────────────────────────────────────────────
    {
      name: 'server-module-internals-private',
      comment:
        "Another module's internals are private: import its index.ts (public API) only. " +
        'Today every cross-module import is a violation, because no module has an index.ts yet.',
      severity: 'warn',
      from: { path: '^server/src/modules/([^/]+)/' },
      to: {
        path: '^server/src/modules/[^/]+/',
        pathNot: ['^server/src/modules/$1/', '^server/src/modules/[^/]+/index[.]ts$'],
      },
    },
    {
      name: 'server-prisma-only-in-data',
      comment: 'Prisma is imported only by modules/*/data/ and platform/db.',
      severity: 'warn',
      from: {
        path: '^server/src/',
        pathNot: [`${MODULE}data/`, '^server/src/platform/db/'],
      },
      to: { path: PRISMA },
    },
    {
      name: 'server-express-only-in-http',
      comment:
        'Express types and values belong to modules/*/http/ and platform/http only. ' +
        'app.ts, routes.ts and index.ts are the composition root.',
      severity: 'warn',
      from: {
        path: '^server/src/',
        pathNot: [
          `${MODULE}http/`,
          '^server/src/platform/http/',
          '^server/src/(app|routes|index)[.]ts$',
        ],
      },
      to: { path: EXPRESS },
    },
    {
      name: 'server-http-not-to-data',
      comment: 'http/ calls use cases; it never reaches the data layer or Prisma directly.',
      severity: 'warn',
      from: { path: `${MODULE}http/` },
      to: { path: [`${MODULE}data/`, ...PRISMA] },
    },
    {
      name: 'server-application-not-to-http',
      comment: 'Use cases do not know about HTTP.',
      severity: 'warn',
      from: { path: `${MODULE}application/` },
      to: { path: [`${MODULE}http/`, ...EXPRESS] },
    },
    {
      name: 'server-domain-is-pure',
      comment:
        'domain/ is pure rules: no I/O, no Prisma, no Express, no other layer, and from ' +
        'platform only the time and errors types.',
      severity: 'warn',
      from: { path: `${MODULE}domain/` },
      to: {
        path: [`${MODULE}(http|application|data)/`, '^server/src/platform/', ...PRISMA, ...EXPRESS],
        pathNot: ['^server/src/platform/(time|errors)([.]ts$|/)'],
      },
    },
    {
      name: 'server-data-layer-direction',
      comment: 'data/ depends only on domain types and platform/db.',
      severity: 'warn',
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
      severity: 'warn',
      from: {
        path: '^client/src/',
        pathNot: ['^client/src/features/[^/]+/api[.]ts$', '^client/src/(shared/)?lib/'],
      },
      to: { path: '^client/src/(shared/)?lib/api[.]ts$' },
    },
    {
      name: 'client-features-via-index',
      comment: "A feature imports another feature only through that feature's index.ts.",
      severity: 'warn',
      from: { path: '^client/src/features/([^/]+)/' },
      to: {
        path: '^client/src/features/[^/]+/',
        pathNot: ['^client/src/features/$1/', '^client/src/features/[^/]+/index[.]ts$'],
      },
    },
    {
      name: 'client-design-system-no-features',
      comment: 'The design system (shared/ui; today components/ui) never imports a feature.',
      severity: 'warn',
      from: { path: '^client/src/(shared/ui|components/ui)/' },
      to: { path: '^client/src/features/' },
    },

    // ── Shared §5 ──────────────────────────────────────────────────────────
    {
      name: 'shared-stays-leaf',
      comment: '@spoh/shared depends on zod only, never on a deployable.',
      severity: 'warn',
      from: { path: '^packages/shared/src/' },
      to: { path: ['^server/', '^client/'] },
    },

    // ── Hygiene ────────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      comment: 'Cycles make the module graph impossible to layer.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'An import that does not resolve is a broken build waiting to happen.',
      severity: 'warn',
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
