import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Synthesising every stack with cdk-nag takes several seconds.
// Pin selection here so root-directory callers cannot accidentally load database suites.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Bound concurrent synths: each runs nag over the full resource catalogue.
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000, maxWorkers: 2 },
});
