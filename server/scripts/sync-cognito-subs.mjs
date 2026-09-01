import { fileURLToPath } from 'node:url';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import pg from 'pg';

/**
 * Point existing roster rows at their real Cognito subjects.
 *
 * Needed exactly once, when an environment moves from the development auth
 * provider to Cognito. The `Volunteer` rows already exist with development
 * subjects (`local:...`); this rewrites `cognitoSub` to the real one so the
 * same person keeps their id, their shifts and everything they have captured.
 *
 * Matching is by email, which is the only identifier both sides share.
 *
 * After a real Cognito migration this script has no further use — new
 * volunteers are provisioned through `POST /api/v1/roster/volunteers`, which
 * creates the identity and the roster row together.
 *
 *   node scripts/sync-cognito-subs.mjs                # preview
 *   node scripts/sync-cognito-subs.mjs --commit       # write
 */

const COMMIT = process.argv.includes('--commit');

function loadEnv() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // Falling back to the ambient environment.
  }
}

loadEnv();

const poolId = process.env.COGNITO_USER_POOL_ID;
const region = process.env.COGNITO_REGION ?? 'ap-southeast-1';
const databaseUrl = process.env.DATABASE_URL;

if (!poolId) throw new Error('COGNITO_USER_POOL_ID is not set');
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const cognito = new CognitoIdentityProviderClient({ region });

/** Every user in the pool, paginated — a real roster is 200 people. */
async function listAllUsers() {
  const users = [];
  let paginationToken;

  do {
    const page = await cognito.send(
      new ListUsersCommand({ UserPoolId: poolId, Limit: 60, PaginationToken: paginationToken }),
    );

    for (const user of page.Users ?? []) {
      const email = user.Attributes?.find((a) => a.Name === 'email')?.Value;
      const sub = user.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (email && sub) users.push({ email: email.toLowerCase(), sub });
    }

    paginationToken = page.PaginationToken;
  } while (paginationToken);

  return users;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const cognitoUsers = await listAllUsers();
console.log(`cognito pool ${poolId}: ${cognitoUsers.length} users`);

const { rows: volunteers } = await client.query(
  'SELECT id, email, "cognitoSub", "displayName" FROM "Volunteer"',
);
console.log(`database: ${volunteers.length} volunteers\n`);

const byEmail = new Map(cognitoUsers.map((user) => [user.email, user.sub]));

let updated = 0;
let alreadyCorrect = 0;
const missing = [];

for (const volunteer of volunteers) {
  const sub = byEmail.get(volunteer.email.toLowerCase());

  if (!sub) {
    missing.push(volunteer.email);
    continue;
  }

  if (volunteer.cognitoSub === sub) {
    alreadyCorrect += 1;
    continue;
  }

  console.log(`${volunteer.email}\n  ${volunteer.cognitoSub}\n  -> ${sub}`);

  if (COMMIT) {
    await client.query('UPDATE "Volunteer" SET "cognitoSub" = $1 WHERE id = $2', [
      sub,
      volunteer.id,
    ]);
  }

  updated += 1;
}

console.log('');
console.log(`${COMMIT ? 'updated' : 'would update'}: ${updated}`);
console.log(`already correct:  ${alreadyCorrect}`);

if (missing.length > 0) {
  // Not an error. These roster rows simply have no Cognito account yet, and
  // they will get `403 NOT_PROVISIONED` until somebody provisions them.
  console.log(`\nno Cognito account (${missing.length}):`);
  for (const email of missing.slice(0, 20)) console.log(`  ${email}`);
}

if (!COMMIT && updated > 0) console.log('\nre-run with --commit to write.');

await client.end();
