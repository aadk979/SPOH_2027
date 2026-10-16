import { pathToFileURL } from 'node:url';

/** Parse before loading application configuration or connecting to a database. */
export function parseCleanupRetryArguments(argv) {
  const result = { apply: false };
  const values = new Set(['id', 'expected-version', 'reason', 'operator-reference']);
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--apply') {
      if (result.apply) throw new Error('Repeated apply flag.');
      result.apply = true;
      continue;
    }
    const key = flag?.slice(2);
    if (!flag?.startsWith('--') || !values.has(key) || Object.hasOwn(result, key))
      throw new Error('Unknown or repeated cleanup retry argument.');
    const value = argv[++index];
    if (!value || value.startsWith('--'))
      throw new Error('A cleanup retry argument needs a value.');
    result[key] = value;
  }
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(result.id ?? ''))
    throw new Error('A cleanup action ID is required.');
  if (
    result.apply &&
    (!/^[1-9]\d*$/.test(result['expected-version'] ?? '') ||
      !Number.isSafeInteger(Number(result['expected-version'])) ||
      !result.reason?.trim() ||
      result.reason.length > 500 ||
      !result['operator-reference']?.trim() ||
      result['operator-reference'].length > 200)
  )
    throw new Error('Execution needs a reviewed version, reason and operator reference.');
  if (
    !result.apply &&
    ['expected-version', 'reason', 'operator-reference'].some((key) => Object.hasOwn(result, key))
  )
    throw new Error('Dry run takes only the action ID.');
  return result;
}

export async function runCleanupRetry(argv) {
  const options = parseCleanupRetryArguments(argv);
  const { env } = await import('../dist/config/env.js');
  // This recovery addition is staging only; production needs a separately reviewed runbook.
  if (
    env.NODE_ENV !== 'production' ||
    env.DEPLOYMENT_ENV !== 'staging' ||
    env.AUTH_PROVIDER !== 'cognito'
  )
    throw new Error(
      'This operator command is restricted to the configured Cognito staging runtime.',
    );
  const { retryContentCleanup } = await import('../dist/platform/scheduler/maintenanceRetry.js');
  const { disconnectPrisma } = await import('../dist/platform/db/client.js');
  try {
    const result = await retryContentCleanup(
      {
        id: options.id,
        apply: options.apply,
        ...(options.apply
          ? {
              expectedVersion: Number(options['expected-version']),
              reason: options.reason,
              operatorReference: options['operator-reference'],
            }
          : {}),
      },
      {
        audit: {
          actorId: null,
          actorSub: 'operator:staging-maintenance',
          eventId: null,
          membershipId: null,
          ip: null,
          userAgent: null,
          requestId: null,
          source: 'SYSTEM',
        },
      },
    );
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    await disconnectPrisma();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCleanupRetry(process.argv.slice(2)).catch(() => {
    process.stderr.write(
      'Content cleanup retry refused or failed; inspect the private plan and application audit before repeating.\n',
    );
    process.exitCode = 1;
  });
}
