import { defineConfig } from '@playwright/test';
import { BROWSER_PROJECTS } from './tests/browser/routeManifest';

/** Populated deterministic UI acceptance. Real API/policy acceptance is P16.10. */
export default defineConfig({
  testDir: './tests/campaign',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['junit', { outputFile: 'test-results/campaign-junit.xml' }]],
  snapshotPathTemplate: '{testDir}/snapshots/{projectName}/{arg}{ext}',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  projects: BROWSER_PROJECTS.map((project) => ({ name: project.name,
    use: { viewport: project.viewport, colorScheme: project.colorScheme,
      isMobile: project.name.startsWith('phone'), hasTouch: project.name.startsWith('phone') } })),
});
