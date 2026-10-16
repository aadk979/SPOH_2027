export function testDatabaseEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> & { DATABASE_URL: string; SPOH_SKIP_DOTENV: '1' };
