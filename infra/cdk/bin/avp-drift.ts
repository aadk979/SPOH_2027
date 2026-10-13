/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Compares a deployed AVP policy store with `avp/policy-store.json` (P11.6) and exits 1 on any
 * drift. Read-only: ListPolicies, GetPolicy and GetSchema.
 *
 *   npx tsx bin/avp-drift.ts <policyStoreId> [region]
 */
import { VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import { readPolicyStoreFile } from '../src/authorizationStore.js';
import { compareStores, hasDrift, type StoreContents } from '../src/avpDrift.js';
import { readDeployedPolicyStore } from '../src/avpDeployed.js';

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
    (await readDeployedPolicyStore(new VerifiedPermissionsClient({ region, maxAttempts: 1 }), policyStoreId)).contents,
  );
  console.log(JSON.stringify(drift, null, 2));
  if (hasDrift(drift)) process.exit(1);
  console.log('no drift');
}

main().catch(() => {
  console.error('AVP drift verification could not complete; no acceptance claimed.');
  process.exit(1);
});
