import type { Logger } from 'pino';
import type { CacheChannel } from '../../events/cacheBus.js';
import { AvpAuthorizer, sdkAvpClient, type AvpClient } from './avpAuthorizer.js';
import { LocalCedarAuthorizer } from './localCedarAuthorizer.js';
import { ResilientAuthorizer } from './resilientAuthorizer.js';
import type { Authorizer } from './types.js';

/**
 * Cedar authorization (ADR-005): the enforcement points (`platform/http/authorize.ts`) and
 * use cases' own rechecks (`../currentPermission.ts`) ask it; nothing else decides access.
 */
export { AvpAuthorizer, sdkAvpClient, type AvpClient } from './avpAuthorizer.js';
export { CircuitBreaker } from './circuitBreaker.js';
export { DecisionCache, decisionKey } from './decisionCache.js';
export {
  EntityBuilder,
  type Question,
  type RequestFacts,
  type ResourceRef,
  type ResourceType,
} from './entityBuilder.js';
export { LocalCedarAuthorizer } from './localCedarAuthorizer.js';
export { degradesToLocal, ResilientAuthorizer } from './resilientAuthorizer.js';
export {
  approvedDefaultGrants,
  databaseRoleGrants,
  defaultRoleGrantRows,
  type RoleGrantRow,
  type RoleGrants,
  type RoleGrantSource,
} from './roleGrants.js';
export {
  AuthorizerUnavailableError,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type Authorizer,
} from './types.js';

export interface AuthorizerSetup {
  /** The environment's AVP policy store (P11.6); none in dev and test. */
  readonly policyStoreId: string | null;
  readonly region: string;
  readonly policyNames?: Readonly<Record<string, string>>;
  readonly log: Pick<Logger, 'warn'>;
  readonly subscribe: (
    channel: CacheChannel,
    listener: (payload: Record<string, unknown>) => void,
  ) => void;
  readonly client?: AvpClient;
}

/** Local Cedar where there is no policy store; otherwise AVP behind the cache and breaker. */
export function createAuthorizer(setup: AuthorizerSetup): Authorizer {
  const local = new LocalCedarAuthorizer();
  if (!setup.policyStoreId) return local;
  const primary = new AvpAuthorizer({
    client: setup.client ?? sdkAvpClient(setup.region),
    policyStoreId: setup.policyStoreId,
    ...(setup.policyNames ? { policyNames: setup.policyNames } : {}),
  });
  const authorizer = new ResilientAuthorizer({ primary, local, log: setup.log });
  authorizer.cache.subscribe(setup.subscribe);
  return authorizer;
}
