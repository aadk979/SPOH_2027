/** One explicit database for destructive local/CI verification; never load dotenv here. */
export function testDatabaseEnvironment(source) {
  if (source.NODE_ENV === 'production' || source.SPOH_SKIP_DOTENV !== '1' || !source.TEST_DATABASE_URL)
    throw new Error('Test work requires explicit TEST_DATABASE_URL and SPOH_SKIP_DOTENV=1 outside production.');
  const address = new URL(source.TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(address.protocol) || address.pathname !== '/spoh2027_test' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) || address.search || address.hash)
    throw new Error('Test work requires the existing loopback spoh2027_test database without URL overrides.');
  const port = ['true', '1'].includes(source.CI) ? '5432' : '5435';
  if (address.port !== port || (source.DATABASE_URL && source.DATABASE_URL !== source.TEST_DATABASE_URL))
    throw new Error('Test database URL and port must match the explicit local/CI test configuration.');
  return { ...source, DATABASE_URL: source.TEST_DATABASE_URL, SPOH_SKIP_DOTENV: '1' };
}
