import type { Role } from '@spoh/access-policies';
import { readPolicySet } from '@spoh/access-policies/policy-set';
import type { PrismaTransactionClient } from '../../db/client.js';

export interface RoleGrants {
  readonly anyStation: boolean;
  /** The Editable action ids this event gives the role. */
  readonly grants: readonly string[];
}

/**
 * Where an event's role grants come from (ADR-005 §2: `RolePermission` rows). That
 * model does not exist yet; P11.5/P11.7 add it with its reader. Until then the only
 * source is the approved defaults every event's rows will start as.
 */
export interface RoleGrantSource {
  grantsFor(
    tx: PrismaTransactionClient,
    eventId: string,
  ): Promise<Readonly<Record<Role, RoleGrants>>>;
}

/** `default-grants.json`: the approved initial grants (G1), unchanged by any event. */
export const approvedDefaultGrants: RoleGrantSource = {
  grantsFor: () => Promise.resolve(readPolicySet().defaultGrants),
};
