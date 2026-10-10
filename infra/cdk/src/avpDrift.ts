/**
 * Drift between a deployed AVP policy store and `avp/policy-store.json` (P11.6). The store holds
 * only the repo's static policies, so any difference is drift: a policy missing, extra or
 * changed, or a different schema. Pure, so the comparison is tested without AWS.
 */
export interface StoreContents {
  /** Cedar JSON schema. */
  readonly schema: unknown;
  /** Policies by their `@id` (the deployed policy's description) to their statement. */
  readonly policies: Readonly<Record<string, string>>;
}

export interface Drift {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly changed: readonly string[];
  readonly schemaChanged: boolean;
}

/** Whitespace differences in a statement are not drift; AVP may normalise line endings. */
const normalise = (statement: string) => statement.replace(/\s+/g, ' ').trim();

/** Key order in a JSON schema is not drift either. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function compareStores(expected: StoreContents, deployed: StoreContents): Drift {
  const want = Object.keys(expected.policies);
  const have = Object.keys(deployed.policies);
  return {
    missing: want.filter((id) => !(id in deployed.policies)).sort(),
    extra: have.filter((id) => !(id in expected.policies)).sort(),
    changed: want
      .filter((id) => id in deployed.policies)
      .filter(
        (id) => normalise(expected.policies[id] ?? '') !== normalise(deployed.policies[id] ?? ''),
      )
      .sort(),
    schemaChanged: canonical(expected.schema) !== canonical(deployed.schema),
  };
}

export function hasDrift(drift: Drift): boolean {
  return (
    drift.missing.length > 0 ||
    drift.extra.length > 0 ||
    drift.changed.length > 0 ||
    drift.schemaChanged
  );
}
