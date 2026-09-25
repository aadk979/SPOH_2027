// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Flat ESLint config for the whole monorepo.
 *
 * Two rules here are load-bearing rather than stylistic:
 *  - the `no-restricted-imports` boundaries (BUILD_PLAN §2.1) keep client and server
 *    independently deployable; they may share only `@spoh/shared`.
 *  - the `no-explicit-any` error (BUILD_PLAN §13) forces `unknown` + narrowing.
 */

/**
 * @param {{ functionLines: number }} limits
 * @returns {import('eslint').Linter.RulesRecord}
 */
function sizeGuards({ functionLines }) {
  const lines = { skipBlankLines: true, skipComments: true };
  return {
    'max-lines-per-function': ['warn', { max: functionLines, ...lines, IIFEs: true }],
    'max-lines': ['warn', { max: 300, ...lines }],
    complexity: ['warn', 10],
    'max-depth': ['warn', 3],
    'max-params': ['warn', 3],
  };
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      'server/prisma/migrations/**',
      'server/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
      'object-shorthand': ['error', 'always'],
    },
  },

  // Deployable boundary: the server may never reach into the client.
  {
    files: ['server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/client/**', '@spoh/client', 'next', 'next/*', 'react', 'react-dom'],
              message:
                'server must not import from the client deployable (BUILD_PLAN §2.1). Share types via @spoh/shared.',
            },
          ],
        },
      ],
    },
  },

  // Deployable boundary: the client may never reach into the server.
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '@spoh/server', '@prisma/client', 'express', 'prisma'],
              message:
                'client must not import from the server deployable (BUILD_PLAN §2.1). Share types via @spoh/shared.',
            },
          ],
        },
      ],
    },
  },

  // `packages/shared` has exactly one runtime dependency: zod (BUILD_PLAN §2.3).
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**', '**/client/**', 'express', '@prisma/client', 'react', 'next'],
              message: '@spoh/shared must stay dependency-free apart from zod (BUILD_PLAN §2.3).',
            },
          ],
        },
      ],
    },
  },

  // The service worker runs in ServiceWorkerGlobalScope: plain JS, its own
  // globals, and no TypeScript program behind it.
  {
    files: ['client/public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
      sourceType: 'script',
    },
  },

  // Size and complexity guards: the hard limits from
  // remediation/standards/engineering-standards.md §2. Warnings for now, so lint
  // reports the refactor debt without failing; P06/P07 flip them to errors.
  {
    files: ['server/src/**/*.ts', 'packages/shared/src/**/*.ts', 'client/src/**/*.ts'],
    rules: sizeGuards({ functionLines: 50 }),
  },
  {
    // React components get 80 lines; a .tsx file is where they live.
    files: ['client/src/**/*.tsx'],
    rules: sizeGuards({ functionLines: 80 }),
  },
  {
    // Routes only compose feature screens.
    files: ['client/src/app/**/page.tsx'],
    rules: { 'max-lines': ['warn', { max: 60, skipBlankLines: true, skipComments: true }] },
  },
  {
    // Exempt by the standard: tests and static data files.
    files: ['**/*.test.{ts,tsx}', '**/tests/**', 'client/src/content/**'],
    rules: Object.fromEntries(Object.keys(sizeGuards({ functionLines: 0 })).map((r) => [r, 'off'])),
  },

  // Config, scripts, seeds and tests legitimately write to stdout.
  {
    files: [
      '**/*.config.{js,mjs,ts}',
      '**/scripts/**',
      'server/prisma/seed.ts',
      '**/*.test.ts',
      '**/tests/**',
    ],
    rules: {
      'no-console': 'off',
      // `vi.mock` factories need `typeof import(...)` to type the original
      // module, and there is no import-statement equivalent inside a callback.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
    },
  },

  prettier,
);
