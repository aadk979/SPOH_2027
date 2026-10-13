import { GetPolicyCommand, GetSchemaCommand, ListPoliciesCommand, type VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import type { StoreContents } from './avpDrift.js';

/** Read-only snapshot reused by drift verification and synthetic matrix attestation. */
export async function readDeployedPolicyStore(client: VerifiedPermissionsClient, policyStoreId: string) {
  const policies: Record<string, string> = {};
  const names: Record<string, string> = {};
  let nextToken: string | undefined;
  do {
    const page = await client.send(new ListPoliciesCommand({ policyStoreId, nextToken }), { abortSignal: AbortSignal.timeout(5_000) });
    for (const item of page.policies ?? []) {
      const policy = await client.send(new GetPolicyCommand({ policyStoreId, policyId: item.policyId }), { abortSignal: AbortSignal.timeout(5_000) });
      const definition = policy.definition && 'static' in policy.definition ? policy.definition.static : undefined;
      const name = definition?.description ?? `avp:${item.policyId}`;
      if (name in policies) throw new Error('Duplicate deployed policy name');
      policies[name] = definition?.statement ?? '';
      if (item.policyId) names[item.policyId] = name;
    }
    nextToken = page.nextToken;
  } while (nextToken);
  const schema = await client.send(new GetSchemaCommand({ policyStoreId }), { abortSignal: AbortSignal.timeout(5_000) });
  return { contents: { schema: JSON.parse(schema.schema ?? '{}') as unknown, policies } satisfies StoreContents, names };
}
