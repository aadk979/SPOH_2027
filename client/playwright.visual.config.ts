import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/snapshots/{projectName}/{arg}{ext}',
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? 'http://localhost:3001',
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: 'laptop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
