import { ACTION_CATALOGUE, type Action, type ActionGroup } from '@spoh/access-policies';
import type { Logger } from 'pino';
import { CircuitBreaker } from './circuitBreaker.js';
import { DecisionCache } from './decisionCache.js';
import type { LocalCedarAuthorizer } from './localCedarAuthorizer.js';
import {
  AuthorizerUnavailableError,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type Authorizer,
} from './types.js';

/** ADR-005 §6 names these Safety writes; Safety's corrections fail closed. */
const SAFETY_DEGRADED_WRITES = new Set<Action>(['Incident.Report', 'LostPerson.Raise']);

/**
 * Which actions may run on the local engine while AVP is unavailable (ADR-005 §6):
 * Capture and Self, Safety's reports and raises, and reads in Report and Safety. The
 * rest (Correct, Manage, Configure, Platform) fail closed with a 503.
 */
export function degradesToLocal(action: Action): boolean {
  const groups: readonly ActionGroup[] = ACTION_CATALOGUE[action].groups;
  const writes = groups.includes('Write');
  if (groups.includes('Capture') || groups.includes('Self')) return true;
  if (groups.includes('Safety')) return !writes || SAFETY_DEGRADED_WRITES.has(action);
  if (groups.includes('Report')) return !writes;
  return false;
}

export interface ResilientAuthorizerOptions {
  readonly primary: Authorizer;
  readonly local: LocalCedarAuthorizer;
  readonly cache?: DecisionCache;
  readonly breaker?: CircuitBreaker;
  readonly log: Pick<Logger, 'warn'>;
}

/**
 * The server's decision path (ADR-005 §6): the decision cache, then AVP behind a
 * circuit breaker, then, only where the action group allows it, the local engine.
 */
export class ResilientAuthorizer implements Authorizer {
  readonly cache: DecisionCache;
  readonly breaker: CircuitBreaker;

  constructor(private readonly options: ResilientAuthorizerOptions) {
    this.cache = options.cache ?? new DecisionCache();
    this.breaker = options.breaker ?? new CircuitBreaker();
  }

  async isAuthorized(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const cached = this.cache.get(request);
    if (cached) return cached;
    let cause: unknown = null;
    if (this.breaker.tryAcquire()) {
      try {
        const decision = await this.options.primary.isAuthorized(request);
        this.breaker.success();
        this.cache.set(request, decision);
        return decision;
      } catch (error) {
        if (!(error instanceof AuthorizerUnavailableError)) throw error;
        this.breaker.failure();
        cause = error;
      }
    }
    return this.degraded(request, cause);
  }

  batch(requests: readonly AuthorizationRequest[]): Promise<AuthorizationDecision[]> {
    return Promise.all(requests.map((request) => this.isAuthorized(request)));
  }

  private degraded(request: AuthorizationRequest, cause: unknown): AuthorizationDecision {
    if (!degradesToLocal(request.action)) {
      throw new AuthorizerUnavailableError('avp-unavailable-fail-closed', cause);
    }
    const decision = this.options.local.evaluate(request);
    // A stable message for the log metric filter and alarm P11.9 adds (`authz.degraded`).
    this.options.log.warn(
      {
        authz: { engine: decision.engine, action: request.action, allowed: decision.allowed },
        circuit: this.breaker.state,
      },
      'authorization degraded to the local engine',
    );
    return decision;
  }
}
