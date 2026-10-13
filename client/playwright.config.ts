import { defineConfig, devices } from '@playwright/test';
import { localBrowserFixtureEnvironment } from '../scripts/browser-test-environment.mjs';

const fixture = localBrowserFixtureEnvironment(process.env);

/**
 * End-to-end tests (BUILD_PLAN §10).
 *
 * Local fixture role/feature regressions against the real same-origin static
 * build. They use SQL setup and local sign-in; they are not real Cognito or
 * staging journeys. The P16 provider campaign has separate fixtures and evidence.
 *
 * Requires the existing spoh2027_test database with three matching explicit
 * URLs, SPOH_SKIP_DOTENV=1, development/local auth and both client/API origins
 * explicitly http://localhost:4012. No default DB, seed or dev server is started.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',

  use: {
    baseURL: fixture.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Containers that ship a browser build other than the one this Playwright
    // release pins (and may not download one) point at it here.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },

  projects: [
    {
      // A phone, because that is what a volunteer is holding. Testing the
      // capture screens at desktop width would miss the thing that matters.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],

  // Started by hand rather than by Playwright: the server needs a database and
  // a seed, and a webServer block that silently starts half a stack produces
  // confusing failures.
  webServer: undefined,
});
