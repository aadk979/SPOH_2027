import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (BUILD_PLAN §10).
 *
 * Three flows only, and they are the three that decide whether the event has
 * usable data: a booth volunteer tapping through registrations, a counter
 * counting entries, and a lost-person alert reaching a second device.
 *
 * Everything else is covered far more cheaply by the integration suite. An
 * exhaustive e2e suite would be slow, flaky, and would still not tell us
 * anything the 224 integration tests do not.
 *
 * Requires a running server and a seeded database:
 *
 *   npm run db:up
 *   npm run db:seed --workspace server
 *   npm run dev
 *   npm run test:e2e --workspace client
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
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
