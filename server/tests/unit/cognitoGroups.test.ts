import {
  AdminRemoveUserFromGroupCommand,
  ListGroupsCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- Exercise the actual operator script, which has no declaration file.
import { applyGroupRemoval, planGroupRemoval } from '../../scripts/cognito-groups.mjs';

const poolId = 'ap-southeast-1_synthetic';
type CleanupCommand = ListGroupsCommand | ListUsersInGroupCommand | AdminRemoveUserFromGroupCommand;
const entries = [
  { group: 'legacy-chief', username: 'synthetic-one' },
  { group: 'legacy-volunteer', username: 'synthetic-two' },
  { group: 'legacy-volunteer', username: 'synthetic-three' },
];

describe('Cognito group cleanup plan', () => {
  it('paginates both inventories, resets each group cursor and remains read-only', async () => {
    const calls: CleanupCommand[] = [];
    const client = {
      send: vi.fn(async (command: CleanupCommand) => {
        calls.push(command);
        if (command instanceof ListGroupsCommand) {
          return command.input.NextToken
            ? { Groups: [{ GroupName: 'legacy-volunteer' }] }
            : { Groups: [{ GroupName: 'legacy-chief' }], NextToken: 'groups-next' };
        }
        if (command instanceof ListUsersInGroupCommand) {
          if (command.input.GroupName === 'legacy-chief') {
            return command.input.NextToken
              ? { Users: [{ Username: 'synthetic-second-chief' }] }
              : { Users: [{ Username: 'synthetic-one' }], NextToken: 'chief-next' };
          }
          return command.input.NextToken
            ? { Users: [{ Username: 'synthetic-three' }] }
            : { Users: [{ Username: 'synthetic-two' }], NextToken: 'volunteer-next' };
        }
        throw new Error('A dry-run must never send a mutation');
      }),
    };

    await expect(planGroupRemoval(client, poolId)).resolves.toEqual([
      entries[0],
      { group: 'legacy-chief', username: 'synthetic-second-chief' },
      entries[1],
      entries[2],
    ]);
    expect(calls.map((command) => command.input)).toEqual([
      { UserPoolId: poolId, NextToken: undefined },
      { UserPoolId: poolId, GroupName: 'legacy-chief', NextToken: undefined },
      { UserPoolId: poolId, GroupName: 'legacy-chief', NextToken: 'chief-next' },
      { UserPoolId: poolId, NextToken: 'groups-next' },
      { UserPoolId: poolId, GroupName: 'legacy-volunteer', NextToken: undefined },
      { UserPoolId: poolId, GroupName: 'legacy-volunteer', NextToken: 'volunteer-next' },
    ]);
    expect(calls.every((command) => !(command instanceof AdminRemoveUserFromGroupCommand))).toBe(
      true,
    );
  });

  it('continues past empty group and user pages without inventing memberships', async () => {
    const client = {
      send: vi.fn(async (command: CleanupCommand) => {
        if (command instanceof ListGroupsCommand)
          return command.input.NextToken
            ? { Groups: [{ GroupName: 'empty-group' }] }
            : { NextToken: 'empty-groups-next' };
        if (command instanceof ListUsersInGroupCommand)
          return command.input.NextToken ? {} : { NextToken: 'empty-users-next' };
        throw new Error('Unexpected mutation');
      }),
    };
    await expect(planGroupRemoval(client, poolId)).resolves.toEqual([]);
    expect(client.send).toHaveBeenCalledTimes(4);
  });
});

describe('Cognito group cleanup apply', () => {
  it.each([undefined, '', 'another-pool', poolId.toUpperCase(), `${poolId} `])(
    'requires exact pool confirmation (%s) before sending any mutation',
    async (confirmPool) => {
      const client = { send: vi.fn() };
      await expect(applyGroupRemoval(client, { poolId, confirmPool, entries })).rejects.toThrow(
        'Exact --confirm-pool is required',
      );
      expect(client.send).not.toHaveBeenCalled();
    },
  );

  it('bounds concurrency to one and applies only the reviewed memberships in order', async () => {
    let active = 0;
    let peak = 0;
    const sent: AdminRemoveUserFromGroupCommand[] = [];
    const client = {
      send: vi.fn(async (command: AdminRemoveUserFromGroupCommand) => {
        active++;
        peak = Math.max(peak, active);
        sent.push(command);
        await Promise.resolve();
        active--;
        return {};
      }),
    };
    const reviewed = Array.from({ length: 20 }, (_, index) => ({
      group: `legacy-group-${index % 2}`,
      username: `synthetic-person-${index}`,
    }));
    await expect(
      applyGroupRemoval(client, { poolId, confirmPool: poolId, entries: reviewed }),
    ).resolves.toBe(20);
    expect(peak).toBe(1);
    expect(active).toBe(0);
    expect(sent.every((command) => command instanceof AdminRemoveUserFromGroupCommand)).toBe(true);
    expect(sent.map((command) => command.input)).toEqual(
      reviewed.map((entry) => ({
        UserPoolId: poolId,
        GroupName: entry.group,
        Username: entry.username,
      })),
    );
  });

  it('propagates the provider failure and stops before the next membership', async () => {
    const failure = new Error('Synthetic provider denial');
    const client = {
      send: vi.fn(async (command: AdminRemoveUserFromGroupCommand) => {
        await Promise.resolve();
        if (command.input.Username === 'synthetic-two') throw failure;
        return {};
      }),
    };
    await expect(applyGroupRemoval(client, { poolId, confirmPool: poolId, entries })).rejects.toBe(
      failure,
    );
    expect(client.send.mock.calls.map(([command]) => command.input.Username)).toEqual([
      'synthetic-one',
      'synthetic-two',
    ]);
  });

  it('returns zero for an explicitly confirmed empty plan', async () => {
    const client = { send: vi.fn() };
    await expect(
      applyGroupRemoval(client, { poolId, confirmPool: poolId, entries: [] }),
    ).resolves.toBe(0);
    expect(client.send).not.toHaveBeenCalled();
  });
});
