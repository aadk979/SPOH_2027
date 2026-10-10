import {
  CognitoIdentityProviderClient,
  ListGroupsCommand,
  ListUsersInGroupCommand,
  AdminRemoveUserFromGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { pathToFileURL } from 'node:url';

/** P12.6. No mutation unless an reviewed inventory and exact pool are explicitly supplied. */
export async function planGroupRemoval(client, poolId) {
  const entries = [];
  let nextToken;
  do {
    const page = await client.send(
      new ListGroupsCommand({ UserPoolId: poolId, NextToken: nextToken }),
    );
    for (const group of page.Groups ?? []) {
      let usersToken;
      do {
        const users = await client.send(
          new ListUsersInGroupCommand({
            UserPoolId: poolId,
            GroupName: group.GroupName,
            NextToken: usersToken,
          }),
        );
        for (const user of users.Users ?? [])
          entries.push({ group: group.GroupName, username: user.Username });
        usersToken = users.NextToken;
      } while (usersToken);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return entries;
}

export async function applyGroupRemoval(client, input) {
  if (input.confirmPool !== input.poolId) throw new Error('Exact --confirm-pool is required');
  for (const entry of input.entries)
    await client.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: input.poolId,
        GroupName: entry.group,
        Username: entry.username,
      }),
    );
  return input.entries.length;
}

async function main() {
  const value = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1];
  const poolId = process.argv.includes('--pool') ? value('pool') : process.env.COGNITO_USER_POOL_ID;
  if (!poolId) throw new Error('--pool is required');
  const client = new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION ?? 'ap-southeast-1',
  });
  const entries = await planGroupRemoval(client, poolId);
  // Dry-run output carries counts, not real roster names or addresses.
  const groups = entries.reduce(
    (result, entry) => ({ ...result, [entry.group]: (result[entry.group] ?? 0) + 1 }),
    {},
  );
  console.log(JSON.stringify({ poolId, memberships: entries.length, groups, mode: 'dry-run' }));
  if (!process.argv.includes('--apply')) return;
  const removed = await applyGroupRemoval(client, {
    poolId,
    confirmPool: value('confirm-pool'),
    entries,
  });
  console.log(JSON.stringify({ removed }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
