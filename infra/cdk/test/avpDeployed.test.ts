import {
  GetPolicyCommand,
  GetSchemaCommand,
  ListPoliciesCommand,
  type VerifiedPermissionsClient,
} from '@aws-sdk/client-verifiedpermissions';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readDeployedPolicyStore } from '../src/avpDeployed.js';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => vi.useRealTimers());

it('paces every read below the management quota, retaining all paginated policies and the schema', async () => {
  const starts: number[] = [];
  const commands: unknown[] = [];
  const send = vi.fn(async (command: unknown, options: { abortSignal: AbortSignal }) => {
    starts.push(performance.now());
    commands.push(command);
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    if (command instanceof ListPoliciesCommand)
      return command.input.nextToken
        ? { policies: [{ policyId: 'p3' }] }
        : { policies: [{ policyId: 'p1' }, { policyId: 'p2' }], nextToken: 'next-page' };
    if (command instanceof GetPolicyCommand)
      return {
        definition: {
          static: {
            description: command.input.policyId,
            statement: `permit(principal, action, resource); // ${command.input.policyId}`,
          },
        },
      };
    expect(command).toBeInstanceOf(GetSchemaCommand);
    return { schema: '{"SPOH":{}}' };
  });
  const pending = readDeployedPolicyStore(
    { send } as unknown as VerifiedPermissionsClient,
    'owned-store',
  );
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(starts).toEqual([0, 250, 500, 750, 1000, 1250]);
  expect(commands.map((command) => (command as ListPoliciesCommand).input.policyStoreId)).toEqual(
    Array(6).fill('owned-store'),
  );
  expect(result.contents.schema).toEqual({ SPOH: {} });
  expect(Object.keys(result.contents.policies)).toEqual(['p1', 'p2', 'p3']);
  expect(result.names).toEqual({ p1: 'p1', p2: 'p2', p3: 'p3' });
});

it('propagates a throttled read once and does not return a partial snapshot or retry it', async () => {
  const failure = Object.assign(new Error('Too many requests'), { name: 'ThrottlingException' });
  const send = vi
    .fn()
    .mockResolvedValueOnce({ policies: [{ policyId: 'p1' }] })
    .mockRejectedValueOnce(failure);
  const pending = readDeployedPolicyStore(
    { send } as unknown as VerifiedPermissionsClient,
    'owned-store',
  );
  const refused = expect(pending).rejects.toBe(failure);
  await vi.runAllTimersAsync();
  await refused;
  expect(send).toHaveBeenCalledTimes(2);
});

it('still refuses duplicate deployed descriptions rather than accepting an overwritten policy', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({ policies: [{ policyId: 'p1' }, { policyId: 'p2' }] })
    .mockResolvedValue({
      definition: {
        static: { description: 'duplicate', statement: 'permit(principal, action, resource);' },
      },
    });
  const pending = readDeployedPolicyStore(
    { send } as unknown as VerifiedPermissionsClient,
    'owned-store',
  );
  const refused = expect(pending).rejects.toThrow('Duplicate deployed policy name');
  await vi.runAllTimersAsync();
  await refused;
  expect(send).toHaveBeenCalledTimes(3);
});
