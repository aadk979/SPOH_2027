import { createHash } from 'node:crypto';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import { readPolicySet, type PolicySet } from '@spoh/access-policies/policy-set';
import {
  ACTION_TYPE,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type Authorizer,
} from './types.js';

/**
 * Cedar WASM over the policy files bundled in the image (ADR-005 §6): the engine for
 * dev and test, UI affordances, and degraded mode. The schema and policies are parsed
 * once; each request is validated against the schema before it is evaluated.
 */
export class LocalCedarAuthorizer implements Authorizer {
  private readonly schemaName: string;
  private readonly policySetId: string;

  constructor(policySet: PolicySet = readPolicySet()) {
    const fingerprint = createHash('sha256')
      .update(policySet.schema)
      .update(JSON.stringify(policySet.policies))
      .digest('hex')
      .slice(0, 16);
    this.schemaName = `schema-${fingerprint}`;
    this.policySetId = `policies-${fingerprint}`;
    const schema = cedar.preparseSchema(this.schemaName, policySet.schema);
    if (schema.type !== 'success') throw new Error('The Cedar schema does not parse');
    const policies = cedar.preparsePolicySet(this.policySetId, {
      staticPolicies: { ...policySet.policies },
    });
    if (policies.type !== 'success') throw new Error('The Cedar policies do not parse');
  }

  /** Synchronous, for callers that never wait on the network. */
  evaluate(request: AuthorizationRequest): AuthorizationDecision {
    const answer = cedar.statefulIsAuthorized({
      principal: request.principal,
      action: { type: ACTION_TYPE, id: request.action },
      resource: request.resource,
      context: { ...request.context },
      entities: [...request.entities],
      preparsedSchemaName: this.schemaName,
      preparsedPolicySetId: this.policySetId,
      validateRequest: true,
    });
    if (answer.type !== 'success') {
      return {
        allowed: false,
        engine: 'local',
        determiningPolicies: [],
        errors: answer.errors.map((error) => error.message),
      };
    }
    const { decision, diagnostics } = answer.response;
    const errors = diagnostics.errors.map((error) => `${error.policyId}: ${error.error.message}`);
    return {
      allowed: decision === 'allow' && errors.length === 0,
      engine: 'local',
      determiningPolicies: [...diagnostics.reason],
      errors,
    };
  }

  isAuthorized(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    return Promise.resolve(this.evaluate(request));
  }

  batch(requests: readonly AuthorizationRequest[]): Promise<AuthorizationDecision[]> {
    return Promise.resolve(requests.map((request) => this.evaluate(request)));
  }
}
