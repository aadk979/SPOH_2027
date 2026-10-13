import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { testDatabaseEnvironment } from '../../scripts/test-database-environment.mjs';

function inside(root, target) {
  const remainder = relative(root, target);
  return remainder !== '' && remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder);
}

function refuseLinks(repo, target) {
  const segments = relative(repo, target).split(sep);
  let current = repo;
  for (const segment of segments) {
    current = resolve(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error('Inventory output cannot follow a symbolic link or junction.');
  }
}

function outputPath(repo, value) {
  const root = resolve(repo, 'remediation/reports/P16');
  const target = resolve(repo, value);
  if (!inside(root, target) || !target.endsWith('.json'))
    throw new Error('Inventory output must be a new JSON file beneath remediation/reports/P16.');
  refuseLinks(repo, target);
  if (existsSync(target)) throw new Error('Inventory output already exists; preserve it and choose a new filename.');
  return target;
}

/** Check every input before importing the app, touching a database or creating directories. */
export function inventoryOptions(args, repo) {
  const flags = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!['--out', '--diff', '--auth-provider'].includes(name) || !value || value.startsWith('--') || flags.has(name))
      throw new Error('Use exactly one --out <new-P16.json> or --diff <snapshot.json>; optional --auth-provider cognito|local.');
    flags.set(name, value);
  }
  if (flags.has('--out') === flags.has('--diff')) throw new Error('An explicit --out or --diff is required; historical snapshots are read-only.');
  const provider = flags.get('--auth-provider') ?? 'cognito';
  if (!['cognito', 'local'].includes(provider)) throw new Error('Inventory auth provider must be cognito or local.');
  if (flags.has('--out')) return { provider, out: outputPath(repo, flags.get('--out')) };
  const compareWith = resolve(repo, flags.get('--diff'));
  if (!inside(repo, compareWith) || !existsSync(compareWith)) throw new Error('Comparison snapshot must exist inside this checkout.');
  refuseLinks(repo, compareWith);
  return { provider, compareWith };
}

export function inventoryEnvironment(source, provider) {
  const checked = testDatabaseEnvironment(source);
  return { ...checked, NODE_ENV: 'test', AUTH_PROVIDER: provider,
    LOCAL_AUTH_SECRET: 'route-inventory-only-secret-thirty-two-chars',
    SESSION_SIGNING_SECRET: 'route-inventory-only-session-secret-thirty-two-chars',
    COGNITO_REGION: 'ap-southeast-1', COGNITO_USER_POOL_ID: 'ap-southeast-1_Inventory',
    COGNITO_CLIENT_ID: 'inventory-only-client', COGNITO_DOMAIN: 'https://identity.example.invalid',
    APP_BASE_URL: 'https://api.example.invalid', CLIENT_BASE_URL: 'https://client.example.invalid',
    CORS_ALLOWED_ORIGINS: 'https://client.example.invalid', LOG_LEVEL: 'silent' };
}
