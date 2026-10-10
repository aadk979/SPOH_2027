/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Compares a deployed AVP policy store with `avp/policy-store.json` (P11.6) and exits 1 on any
 * drift. Read-only: ListPolicies, GetPolicy and GetSchema.
 *
 *   npx tsx bin/avp-drift.ts <policyStoreId> [region]
 */
import {
  GetPolicyCommand,
  GetSchemaCommand,
  ListPoliciesCommand,
  VerifiedPermissionsClient,
} from '@aws-sdk/client-verifiedpermissions';
import { readPolicyStoreFile } from '../src/authorizationStore.js';
import { compareStores, hasDrift, type StoreContents } from '../src/avpDrift.js';

async function deployed(client: VerifiedPermissionsClient, policyStoreId: string) {
  const policies: Record<string, string> = {};
  let nextToken: string | undefined;
  do {
    const page = await client.send(new ListPoliciesCommand({ policyStoreId, nextToken }));
    for (const item of page.policies ?? []) {
      const policy = await client.send(
        new GetPolicyCommand({ policyStoreId, policyId: item.policyId }),
      );
      const definition = policy.definition;
      const statement = definition && 'static' in definition ? definition.static?.statement : '';
      const name =
        definition && 'static' in definition ? definition.static?.description : undefined;
      policies[name ?? `avp:${item.policyId}`] = statement ?? '';
    }
    nextToken = page.nextToken;
  } while (nextToken);
  const schema = await client.send(new GetSchemaCommand({ policyStoreId }));
  return { schema: JSON.parse(schema.schema ?? '{}') as unknown, policies } satisfies StoreContents;
}

async function main(): Promise<void> {
  const [policyStoreId, region = 'ap-southeast-1'] = process.argv.slice(2);
  if (!policyStoreId) throw new Error('usage: avp-drift <policyStoreId> [region]');
  const file = readPolicyStoreFile();
  const expected: StoreContents = {
    schema: file.schema,
    policies: Object.fromEntries(file.policies.map((policy) => [policy.id, policy.statement])),
  };
  const drift = compareStores(
    expected,
    await deployed(new VerifiedPermissionsClient({ region }), policyStoreId),
  );
  console.log(JSON.stringify(drift, null, 2));
  if (hasDrift(drift)) process.exit(1);
  console.log('no drift');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
