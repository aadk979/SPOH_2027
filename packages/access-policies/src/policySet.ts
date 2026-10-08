import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import type { Role } from './generated/actions.js';
import { readDefaultGrants, type RoleDefaults } from './defaultGrants.js';

export type { RoleDefaults } from './defaultGrants.js';

/**
 * The deployable policy set: the files CDK deploys to the AVP store (P11.6) and the
 * server's local engine evaluates (ADR-005 §6), read from this package and nowhere
 * else. This entry loads Cedar; the package root stays metadata only.
 */

/** The schema's namespace; every entity and action type is qualified by it. */
export const CEDAR_NAMESPACE = 'SPOH';

export interface PolicySet {
  readonly schema: string;
  /** Every static policy's text, keyed by its `@id` annotation. */
  readonly policies: Readonly<Record<string, string>>;
  /** What a new event's RolePermission rows start as (ADR-005 §2). */
  readonly defaultGrants: Readonly<Record<Role, RoleDefaults>>;
}

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function read(path: string): string {
  return readFileSync(`${ROOT}${path}`, 'utf8');
}

function policiesById(): Record<string, string> {
  const policies: Record<string, string> = {};
  const files = readdirSync(`${ROOT}policies`)
    .filter((file) => file.endsWith('.cedar'))
    .sort();
  for (const file of files) {
    const parts = cedar.policySetTextToParts(read(`policies/${file}`));
    if (parts.type !== 'success') throw new Error(`${file} does not parse`);
    for (const text of parts.policies) {
      const id = /@id\("([^"]+)"\)/.exec(text)?.[1];
      if (!id) throw new Error(`${file}: a policy has no @id`);
      if (policies[id]) throw new Error(`duplicate policy id ${id}`);
      policies[id] = text;
    }
  }
  return policies;
}

let loaded: PolicySet | null = null;

/** The policy set, read once per process; the files are immutable in a deployed image. */
export function readPolicySet(): PolicySet {
  loaded ??= Object.freeze({
    schema: read('schema.cedarschema'),
    policies: Object.freeze(policiesById()),
    defaultGrants: readDefaultGrants(),
  });
  return loaded;
}
