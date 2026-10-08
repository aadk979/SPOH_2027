import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROLE_IDS, type Role } from './generated/actions.js';

/**
 * `default-grants.json`: what a new event's RolePermission rows start as (ADR-005 §2),
 * as approved at G1. A plain file read, without Cedar, for the writers that seed events.
 */
export interface RoleDefaults {
  readonly rank: number;
  readonly anyStation: boolean;
  readonly grants: readonly string[];
}

let loaded: Readonly<Record<Role, RoleDefaults>> | null = null;

export function readDefaultGrants(): Readonly<Record<Role, RoleDefaults>> {
  if (loaded) return loaded;
  const file = fileURLToPath(new URL('../default-grants.json', import.meta.url));
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, RoleDefaults>;
  const grants = {} as Record<Role, RoleDefaults>;
  for (const role of ROLE_IDS) {
    const entry = raw[role];
    if (!entry) throw new Error(`default-grants.json has no ${role}`);
    grants[role] = Object.freeze({
      rank: entry.rank,
      anyStation: entry.anyStation,
      grants: Object.freeze([...entry.grants]),
    });
  }
  loaded = Object.freeze(grants);
  return loaded;
}
