import { testDatabaseEnvironment } from './test-database-environment.mjs';

function localOnly(source) {
  if (source.NODE_ENV === 'production' || source.DEPLOYMENT_ENV !== 'development' || source.AUTH_PROVIDER !== 'local')
    throw new Error('Local fixture/composition browser suites require explicit development and local auth; never run them against staging or production.');
}

function origin(value) {
  if (!value) throw new Error('An explicit local browser origin is required.');
  const address = new URL(value);
  if (address.origin !== value || address.protocol !== 'http:' || address.hostname !== 'localhost' || address.port !== '4012')
    throw new Error('Local browser fixtures use only the same-origin http://localhost:4012 static build.');
  return address.origin;
}

/** SQL/local-sign-in fixtures prove local regressions only, never provider or staging acceptance. */
export function localBrowserFixtureEnvironment(source, flavor = 'journeys') {
  localOnly(source);
  const checked = testDatabaseEnvironment(source);
  if (!source.E2E_DATABASE_URL || source.E2E_DATABASE_URL !== checked.DATABASE_URL || source.DATABASE_URL !== checked.DATABASE_URL)
    throw new Error('Browser fixtures require DATABASE_URL, TEST_DATABASE_URL and E2E_DATABASE_URL to be identical.');
  const baseURL = origin(flavor === 'visual' ? source.VISUAL_BASE_URL : source.E2E_BASE_URL);
  const apiOrigin = origin(flavor === 'visual' ? source.VISUAL_API_URL : source.E2E_API_ORIGIN);
  if (baseURL !== apiOrigin) throw new Error('Browser fixture client and API must share the explicit local origin.');
  return { baseURL, apiOrigin, databaseUrl: checked.DATABASE_URL };
}

/** Network-mocked UI composition has no SQL or provider acceptance meaning. */
export function localBrowserMockEnvironment(source) {
  localOnly(source);
  return { baseURL: origin(source.E2E_BASE_URL), evidence: 'mocked local UI composition only' };
}

/** Legacy synthetic JWT load scripts stay local; P16 load uses real provider credentials. */
export function legacyLocalLoadEnvironment(source) {
  localOnly(source);
  testDatabaseEnvironment(source);
  if (!source.LOCAL_AUTH_SECRET || source.LOCAL_AUTH_SECRET.length < 32)
    throw new Error('Legacy local load requires an explicit test-only signing secret.');
  return { apiOrigin: origin(source.LOAD_TEST_API), evidence: 'legacy local synthetic JWT harness; not staging acceptance' };
}
