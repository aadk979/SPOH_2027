import { localBrowserFixtureEnvironment } from '../../../scripts/browser-test-environment.mjs';

/** This SQL fixture boundary cannot be used by real staging/provider journeys. */
export function checkedBrowserDatabase(): string {
  return localBrowserFixtureEnvironment(process.env).databaseUrl;
}
