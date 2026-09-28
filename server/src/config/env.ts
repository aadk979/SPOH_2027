import { fileURLToPath } from 'node:url';
import { parseEnv, type Env } from './schema.js';

/**
 * Boot-time configuration.
 *
 * `process.env` is parsed once, here, and the server refuses to start on a
 * missing or malformed value (BUILD_PLAN §4). Nothing else in the codebase
 * reads `process.env` directly — an import of this module is the only way to
 * reach configuration, so a typo in a variable name fails at boot rather than
 * at 10am on 7 January.
 */

/**
 * Load `server/.env` for local development. In CI and in deployed environments
 * the variables arrive from the environment itself and this is a no-op.
 */
function loadLocalEnvFile(): void {
  if (process.env.SPOH_SKIP_DOTENV === '1') return;
  try {
    // fileURLToPath, not URL.pathname — on Windows the latter yields "/C:/...".
    process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
  } catch {
    // No .env file. Expected everywhere except a developer machine.
  }
}

loadLocalEnvFile();

export { parseEnv, type Env };

export const env: Env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
