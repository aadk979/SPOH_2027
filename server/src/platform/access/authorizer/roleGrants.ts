import { ROLE_IDS, type Role } from '@spoh/access-policies';
import { readDefaultGrants } from '@spoh/access-policies/default-grants';
import type { PrismaTransactionClient } from '../../db/client.js';

export interface RoleGrants {
  readonly anyStation: boolean;
  /** The Editable action ids this event gives the role. */
  readonly grants: readonly string[];
}

/** Where an event's role grants come from (ADR-005 §2). */
export interface RoleGrantSource {
  grantsFor(
    tx: PrismaTransactionClient,
    eventId: string,
  ): Promise<Readonly<Record<Role, RoleGrants>>>;
}

/**
 * The event's `RolePermission` rows, read in the caller's transaction. Whether a role
 * may capture at any station is the catalogue's (IC and above), not a grant. An
 * event without rows grants nothing, so every Editable action is denied.
 */
export const databaseRoleGrants: RoleGrantSource = {
  async grantsFor(tx, eventId) {
    const rows = await tx.rolePermission.findMany({
      where: { eventId },
      select: { role: true, action: true },
    });
    const catalogue = readDefaultGrants();
    const grants = {} as Record<Role, RoleGrants>;
    for (const role of ROLE_IDS) {
      grants[role] = {
        anyStation: catalogue[role].anyStation,
        grants: rows.filter((row) => row.role === role).map((row) => row.action),
      };
    }
    return grants;
  },
};

/** `default-grants.json`: the approved initial grants (G1), unchanged by any event. */
export const approvedDefaultGrants: RoleGrantSource = {
  grantsFor: () => Promise.resolve(readDefaultGrants()),
};

export interface RoleGrantRow {
  readonly role: Role;
  readonly action: string;
}

/** The approved defaults as `RolePermission` rows: what every new event starts with. */
export function defaultRoleGrantRows(): RoleGrantRow[] {
  return Object.entries(readDefaultGrants()).flatMap(([role, { grants }]) =>
    grants.map((action) => ({ role: role as Role, action })),
  );
}
