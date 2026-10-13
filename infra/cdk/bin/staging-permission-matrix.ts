/* eslint-disable no-console -- read-only operator CLI; synthetic attestation is its output */
import { readFileSync, writeFileSync } from 'node:fs';
import { IsAuthorizedCommand, VerifiedPermissionsClient } from '@aws-sdk/client-verifiedpermissions';
import { readPolicyStoreFile } from '../src/authorizationStore.js';
import { readDeployedPolicyStore } from '../src/avpDeployed.js';
import { compareStores, hasDrift, canonical, type StoreContents } from '../src/avpDrift.js';
import { permissionCaseId, permissionFixtures, permissionInventory, policyStoreDigests } from '../src/permissionMatrix.js';

async function main() {
  const [policyStoreId, recordPath, outputPath, commit, region = 'ap-southeast-1'] = process.argv.slice(2);
  if (!policyStoreId || !recordPath || !outputPath || !/^[a-f0-9]{40}$/.test(commit ?? ''))
    throw new Error('Supply staging store, synthetic suite record, output file and exact commit SHA');
  const fixtures = permissionFixtures(readFileSync(recordPath, 'utf8'));
  const inventory = permissionInventory(fixtures);
  const file = readPolicyStoreFile();
  const expected: StoreContents = { schema: file.schema,
    policies: Object.fromEntries(file.policies.map((policy) => [policy.id, policy.statement])) };
  const client = new VerifiedPermissionsClient({ region, maxAttempts: 1 });
  const deployed = await readDeployedPolicyStore(client, policyStoreId);
  if (hasDrift(compareStores(expected, deployed.contents))) throw new Error('Staging policy/schema drift');
  const results = [];
  for (const fixture of fixtures) {
    const { request, outcome } = fixture;
    const answer = await client.send(new IsAuthorizedCommand({ policyStoreId,
      principal: { entityType: request.principal.type, entityId: request.principal.id },
      action: { actionType: request.action.type, actionId: request.action.id },
      resource: { entityType: request.resource.type, entityId: request.resource.id },
      context: { cedarJson: JSON.stringify(request.context) }, entities: { cedarJson: JSON.stringify(request.entities) },
    }), { abortSignal: AbortSignal.timeout(5_000) });
    const policies = (answer.determiningPolicies ?? []).map((policy) => deployed.names[policy.policyId ?? ''] ?? 'unmapped').sort();
    const actual = answer.decision?.toLowerCase();
    const errors = answer.errors?.length ?? 0;
    results.push({ caseId: permissionCaseId(fixture), action: request.action.id,
      expected: outcome.decision, actual, policies, errors,
      passed: actual === outcome.decision && errors === 0 && canonical(policies) === canonical([...outcome.reasons].sort()) });
  }
  const after = await readDeployedPolicyStore(client, policyStoreId);
  const stable = canonical(policyStoreDigests(after.contents)) === canonical(policyStoreDigests(deployed.contents));
  const passed = stable && results.every((result) => result.passed);
  writeFileSync(outputPath, `${JSON.stringify({ version: 1, stage: 'staging', commit, policyStoreId,
    checkedAt: new Date().toISOString(), source: policyStoreDigests(expected),
    deployed: policyStoreDigests(deployed.contents), inventory, stable, passed, results }, null, 2)}\n`);
  console.log(JSON.stringify({ commit, ...inventory, ...policyStoreDigests(deployed.contents), stable, passed }));
  if (!passed) process.exitCode = 1;
}

main().catch(() => { console.error('Staging permission matrix could not complete; no acceptance claimed.'); process.exitCode = 1; });
