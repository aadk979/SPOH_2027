import { defineConfig } from 'vitest/config';

// Synthesising every stack with cdk-nag takes several seconds.
export default defineConfig({ test: { testTimeout: 30_000 } });
