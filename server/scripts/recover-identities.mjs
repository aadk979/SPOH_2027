import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_ROOT = fileURLToPath(new URL('../../.local/identity-recovery/', import.meta.url));
const VALUE_FLAGS = new Set(['database-env', 'operator-token-env', 'organisation', 'pool',
  'plan', 'plan-out', 'reason', 'owner-approval-reference', 'resend-key']);
const BOOLEAN_FLAGS = new Set(['apply', 'invite', 'help']);

/** Parsing is import-safe and precedes loading any application environment or provider. */
export function parseRecoveryArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]?.replace(/^--/, '');
    if (!argv[index]?.startsWith('--') || (!VALUE_FLAGS.has(name) && !BOOLEAN_FLAGS.has(name)))
      throw new Error('Unknown recovery argument.');
    if (Object.hasOwn(options, name)) throw new Error('Repeated recovery argument.');
    if (BOOLEAN_FLAGS.has(name)) options[name] = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('A recovery argument needs a value.');
      options[name] = value;
    }
  }
  if (options.help) return options;
  for (const key of ['database-env', 'operator-token-env', 'organisation', 'pool'])
    if (!options[key]) throw new Error('Explicit database, operator evidence, organisation and pool are required.');
  for (const key of ['database-env', 'operator-token-env'])
    if (!/^SPOH_RECOVERY_[A-Z_]+$/.test(options[key])) throw new Error('Use a dedicated recovery environment key.');
  if (options.apply && options.invite) throw new Error('Apply and invitation are separate stages.');
  if (options.apply || options.invite) {
    if (!options.plan || !options.reason || !options['owner-approval-reference'])
      throw new Error('Execution needs a reviewed plan, reason and owner approval reference.');
    if (options['plan-out']) throw new Error('Execution cannot replace its reviewed plan.');
  } else if (options.plan || !options['plan-out']) throw new Error('Dry run requires a new private plan output.');
  if (options['resend-key'] && !options.invite) throw new Error('A resend UUID belongs only to the invitation stage.');
  return options;
}

function privatePlanPath(value) {
  const path = resolve(PRIVATE_ROOT, value);
  const child = relative(PRIVATE_ROOT, path);
  if (!child || child.startsWith('..') || isAbsolute(child) || !path.endsWith('.json'))
    throw new Error('Plans must stay in the private recovery directory.');
  return path;
}

function setExplicitEnvironment(options) {
  if (process.env.SPOH_SKIP_DOTENV !== '1') throw new Error('SPOH_SKIP_DOTENV=1 must be explicit.');
  const database = process.env[options['database-env']];
  const operatorToken = process.env[options['operator-token-env']];
  if (!database || !operatorToken) throw new Error('Dedicated database and operator evidence are required.');
  const parsed = new URL(database);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('A PostgreSQL database is required.');
  process.env.DATABASE_URL = database;
  process.env.COGNITO_USER_POOL_ID = options.pool;
  process.env.AUTH_PROVIDER = 'cognito';
  return operatorToken;
}

export async function runRecoveryCommand(argv) {
  const options = parseRecoveryArguments(argv);
  if (options.help) {
    process.stdout.write('Default: read-only plan. Explicit --apply or --invite requires a reviewed private plan and owner approval reference.\n' +
      'Required: --database-env SPOH_RECOVERY_DATABASE_URL --operator-token-env SPOH_RECOVERY_OPERATOR_TOKEN --organisation ID --pool ID\n' +
      'Plan: --plan-out NAME.json; execute: --plan NAME.json --reason TEXT --owner-approval-reference REF.\n');
    return;
  }
  const operatorToken = setExplicitEnvironment(options);
  const service = await import('../dist/modules/identityRecovery/index.js');
  try {
    if (!options.apply && !options.invite) {
      const plan = await service.planIdentityRecovery({ organisationId: options.organisation,
        targetPoolId: options.pool, operatorToken });
      const path = privatePlanPath(options['plan-out']);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      process.stdout.write(JSON.stringify({ planId: plan.planId, eligible: plan.items.length,
        personIds: plan.items.map((item) => item.personId) }) + '\n');
      return;
    }
    const plan = service.RecoveryPlan.parse(JSON.parse(await readFile(privatePlanPath(options.plan), 'utf8')));
    if (plan.targetPoolId !== options.pool || plan.organisationId !== options.organisation)
      throw new Error('The reviewed plan does not match the explicit target.');
    const input = { plan, operatorToken, reason: options.reason,
      ownerApprovalReference: options['owner-approval-reference'] };
    const result = options.apply ? await service.applyIdentityRecovery(input)
      : await service.inviteRecoveredIdentities({ ...input, resendKey: options['resend-key'] });
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    const { disconnectPrisma } = await import('../dist/platform/db/client.js');
    await disconnectPrisma();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRecoveryCommand(process.argv.slice(2)).catch(() => {
    process.stderr.write('Recovery command failed. Review the private operator context before retrying.\n');
    process.exitCode = 1;
  });
}
