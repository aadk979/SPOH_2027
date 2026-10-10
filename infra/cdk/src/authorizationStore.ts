import { readFileSync } from 'node:fs';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import { PolicyStatement, type IGrantable } from 'aws-cdk-lib/aws-iam';
import { CfnPolicy, CfnPolicyStore } from 'aws-cdk-lib/aws-verifiedpermissions';
import { Construct } from 'constructs';
import type { StageName } from './config.js';

interface PolicyStoreFile {
  readonly schema: unknown;
  readonly policies: readonly { readonly id: string; readonly statement: string }[];
}

/** `packages/access-policies/avp/policy-store.json`, generated and checked in CI. */
export function readPolicyStoreFile(): PolicyStoreFile {
  const url = new URL('../../../packages/access-policies/avp/policy-store.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as PolicyStoreFile;
}

/**
 * The environment's Amazon Verified Permissions store (P11.6, ADR-005 §6): STRICT validation,
 * the schema and every static policy from `packages/access-policies`, nothing else. Per-event
 * permissions are RolePermission rows the app sends as entity data, so the store never changes
 * at runtime and the app's role may only ask it (`IsAuthorized`), never write a policy.
 */
export class AuthorizationStore extends Construct {
  readonly policyStoreId: string;
  readonly policyStoreArn: string;
  /** The store's policy ids to the `@id`s the local engine reports, as JSON for the app. */
  readonly policyNamesJson: string;

  constructor(scope: Construct, id: string, input: { stage: StageName }) {
    super(scope, id);
    const file = readPolicyStoreFile();
    const store = new CfnPolicyStore(this, 'Store', {
      description: `SPOH ${input.stage} authorization`,
      validationSettings: { mode: 'STRICT' },
      schema: { cedarJson: JSON.stringify(file.schema) },
      deletionProtection: { mode: input.stage === 'prod' ? 'ENABLED' : 'DISABLED' },
    });
    const names: Record<string, string> = {};
    for (const policy of file.policies) {
      const resource = new CfnPolicy(this, `Policy-${policy.id}`, {
        policyStoreId: store.attrPolicyStoreId,
        definition: {
          static: { description: policy.id, statement: policy.statement },
        },
      });
      names[resource.attrPolicyId] = policy.id;
    }
    this.policyStoreId = store.attrPolicyStoreId;
    this.policyStoreArn = store.attrArn;
    this.policyNamesJson = Stack.of(this).toJsonString(names);
    new CfnOutput(this, 'PolicyStoreId', { value: store.attrPolicyStoreId });
  }

  /** The app asks; it never creates, edits or deletes a policy. */
  grantIsAuthorized(grantee: IGrantable): void {
    grantee.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['verifiedpermissions:IsAuthorized'],
        resources: [this.policyStoreArn],
      }),
    );
  }
}
