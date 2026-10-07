import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import type { Action } from '@spoh/access-policies';
import { readPolicySet } from '@spoh/access-policies/policy-set';
import type {
  IsAuthorizedCommandInput,
  IsAuthorizedCommandOutput,
} from '@aws-sdk/client-verifiedpermissions';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AvpAuthorizer,
  LocalCedarAuthorizer,
  type AuthorizationRequest,
  type AvpClient,
} from '../../src/platform/access/authorizer/index.js';

/**
 * The authorizer contract (ADR-005 §6, P11.4): every request the policy suite in
 * `packages/access-policies` evaluates is recorded, then replayed through both
 * engines, which must reach the suite's decisions for the same policies' reasons.
 *
 * AVP is a stand-in here: it receives the adapter's exact `IsAuthorized` input,
 * parses it as AVP does (`cedarJson` strings, store-generated policy ids), and
 * evaluates it with Cedar. That proves the request the adapter sends and how it
 * reads the answer; the real store is compared with the repo in P11.6.
 */
interface Recorded {
  request: {
    principal: { type: string; id: string };
    action: { type: string; id: string };
    resource: { type: string; id: string };
    context: Record<string, cedar.CedarValueJson>;
    entities: cedar.EntityJson[];
  };
  outcome: { decision?: 'allow' | 'deny'; reasons?: string[]; errors?: number; failure?: true };
}

const PACKAGE = fileURLToPath(new URL('../../../packages/access-policies/', import.meta.url));

function recordSuite(): Recorded[] {
  const dir = mkdtempSync(join(tmpdir(), 'policy-suite-'));
  const file = join(dir, 'requests.jsonl');
  try {
    const tests = readdirSync(join(PACKAGE, 'tests'))
      .filter((name) => name.endsWith('.test.mjs'))
      .map((name) => join('tests', name));
    execFileSync(process.execPath, ['--test', ...tests], {
      cwd: PACKAGE,
      env: { ...process.env, SPOH_POLICY_SUITE_RECORD: file },
      stdio: 'pipe',
    });
    return readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Recorded);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** AVP's view: policies under opaque ids, and Cedar JSON inside the request. */
function standInAvp(): { client: AvpClient; names: Record<string, string> } {
  const { schema, policies } = readPolicySet();
  const names: Record<string, string> = {};
  const stored: Record<string, string> = {};
  Object.entries(policies).forEach(([id, text], index) => {
    const avpId = `avp-policy-${index}`;
    names[avpId] = id;
    stored[avpId] = text;
  });
  // Parsed once, under names of its own, as a store holds its policies.
  if (cedar.preparseSchema('contract-avp-schema', schema).type !== 'success')
    throw new Error('schema');
  if (
    cedar.preparsePolicySet('contract-avp-policies', { staticPolicies: stored }).type !== 'success'
  ) {
    throw new Error('policies');
  }
  const client: AvpClient = {
    isAuthorized: (input: IsAuthorizedCommandInput) => {
      if (input.policyStoreId !== 'contract-store') throw new Error('wrong store');
      const answer = cedar.statefulIsAuthorized({
        principal: { type: input.principal!.entityType!, id: input.principal!.entityId! },
        action: { type: input.action!.actionType!, id: input.action!.actionId! },
        resource: { type: input.resource!.entityType!, id: input.resource!.entityId! },
        context: JSON.parse((input.context as { cedarJson: string }).cedarJson),
        entities: JSON.parse((input.entities as { cedarJson: string }).cedarJson),
        preparsedSchemaName: 'contract-avp-schema',
        preparsedPolicySetId: 'contract-avp-policies',
        validateRequest: true,
      });
      if (answer.type !== 'success') {
        return Promise.reject(Object.assign(new Error('invalid'), { name: 'ValidationException' }));
      }
      const output: IsAuthorizedCommandOutput = {
        decision: answer.response.decision === 'allow' ? 'ALLOW' : 'DENY',
        determiningPolicies: answer.response.diagnostics.reason.map((policyId) => ({ policyId })),
        errors: answer.response.diagnostics.errors.map((error) => ({
          errorDescription: error.error.message,
        })),
        $metadata: {},
      };
      return Promise.resolve(output);
    },
  };
  return { client, names };
}

function asRequest(recorded: Recorded): AuthorizationRequest {
  const { principal, action, resource, context, entities } = recorded.request;
  return { principal, action: action.id as Action, resource, context, entities, eventId: null };
}

describe('the policy suite through both authorizers', () => {
  let recorded: Recorded[];
  const local = new LocalCedarAuthorizer();
  const avpStandIn = standInAvp();
  const avp = new AvpAuthorizer({
    client: avpStandIn.client,
    policyStoreId: 'contract-store',
    policyNames: avpStandIn.names,
    timeoutMs: 5_000,
  });

  beforeAll(() => {
    recorded = recordSuite();
  }, 120_000);

  it('records the whole suite', () => {
    expect(recorded.length).toBeGreaterThan(300);
    expect(recorded.some((r) => r.outcome.decision === 'allow')).toBe(true);
    expect(recorded.some((r) => r.outcome.decision === 'deny')).toBe(true);
    expect(new Set(recorded.map((r) => r.request.action.id)).size).toBeGreaterThan(50);
  });

  it('reaches every recorded decision, for the same reasons, on both engines', async () => {
    const mismatches: string[] = [];
    for (const [index, entry] of recorded.entries()) {
      const request = asRequest(entry);
      const expected = {
        allowed: entry.outcome.decision === 'allow' && !entry.outcome.errors,
        reasons: [...(entry.outcome.reasons ?? [])].sort(),
      };
      for (const decision of [local.evaluate(request), await avp.isAuthorized(request)]) {
        const actual = {
          allowed: decision.allowed,
          reasons: [...decision.determiningPolicies].sort(),
        };
        if (entry.outcome.failure) {
          if (decision.allowed) mismatches.push(`${index} ${decision.engine}: allowed a failure`);
        } else if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          mismatches.push(
            `${index} ${decision.engine} ${request.action}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  }, 60_000);
});
