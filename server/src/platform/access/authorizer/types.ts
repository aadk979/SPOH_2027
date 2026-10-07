import type { Action } from '@spoh/access-policies';
import { CEDAR_NAMESPACE } from '@spoh/access-policies/policy-set';
import type { CedarValueJson, EntityJson, TypeAndId } from '@cedar-policy/cedar-wasm/nodejs';
import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../errors/index.js';

/**
 * One authorization question in Cedar JSON (ADR-005 §6). Both engines receive exactly
 * these values: the local engine evaluates them, and AVP receives them as `cedarJson`.
 */
export interface AuthorizationRequest {
  readonly principal: TypeAndId;
  readonly action: Action;
  readonly resource: TypeAndId;
  readonly context: Readonly<Record<string, CedarValueJson>>;
  readonly entities: readonly EntityJson[];
  /** The event the question is about, so that its bus messages clear cached decisions. */
  readonly eventId: string | null;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly engine: 'avp' | 'local';
  /** The `@id`s of the policies that determined the decision. */
  readonly determiningPolicies: readonly string[];
  /** Evaluation errors. Any error denies: a skipped `forbid` must never allow. */
  readonly errors: readonly string[];
}

export interface Authorizer {
  isAuthorized(request: AuthorizationRequest): Promise<AuthorizationDecision>;
  batch(requests: readonly AuthorizationRequest[]): Promise<AuthorizationDecision[]>;
}

/** An entity type of the policy schema, qualified by its namespace. */
export function entityType(name: string): string {
  return `${CEDAR_NAMESPACE}::${name}`;
}

export const ACTION_TYPE = entityType('Action');

export function uid(type: string, id: string): TypeAndId {
  return { type: entityType(type), id };
}

/** An attribute that refers to another entity. */
export function ref(type: string, id: string): CedarValueJson {
  return { __entity: uid(type, id) };
}

/**
 * The authoritative engine could not answer (ADR-005 §6). For actions that may not run
 * on the local engine this is a 503, never a 403: nobody was refused, nothing was decided.
 */
export class AuthorizerUnavailableError extends AppError {
  constructor(reason: string, cause?: unknown) {
    super(503, ERROR_CODES.SERVICE_UNAVAILABLE, {
      message: 'The permissions service is unavailable. Try again shortly.',
      details: { reason },
      cause,
      expose: true,
    });
  }
}
