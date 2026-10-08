# SPOH access policies

The accepted [ADR-005](../../docs/adr/ADR-005-authorization-avp.md) Cedar model,
advanced under [ADR-010](../../docs/adr/ADR-010-delivery-process.md). The historical
[P05 bench](../../remediation/reports/P05/cedar/README.md) remains the design record.
The schema, all six policy files, default grants and C1–C13 changes are copied
byte-for-byte; tests enforce that correspondence for this prerequisite milestone.

```powershell
npm run generate --workspace packages/access-policies
npm run check:generated --workspace packages/access-policies
npm run test --workspace packages/access-policies
npm run typecheck --workspace packages/access-policies
npm run build --workspace packages/access-policies
```

`schema.cedarschema` owns the 66 concrete action identifiers, ten action groups,
principal types and resource types. `tools/generate-actions.mjs` produces the
standalone TypeScript catalogue in `src/generated/actions.ts`. That catalogue
contains metadata and types only; importing it does not evaluate authorization
or load Cedar WASM. It is ready for the shared generated-actions export in P11.1.
The root coordinator owns that integration and the workspace lockfile/CI change.

The generator deliberately writes only this package by default. The coordinator
can opt into the fixed shared output from the repository root:

```powershell
node packages/access-policies/tools/generate-actions.mjs --shared-output
node packages/access-policies/tools/generate-actions.mjs --shared-output --check
```

The shared option selects `packages/shared/src/generated/actions/index.ts` in
addition to the package output. Check mode requires both selected artifacts to
exist and match; it creates no directories and repairs no drafts. Unknown or
path-bearing options fail before any output write. Tests exercise this behavior
inside isolated mock repositories under this package's ignored `.local` folder.

On 6 October the human owner approved fixed floors equal to the lowest approved
default role for the 46 Editable actions with initial grants. `minimum-roles.json`
records those explicit action-to-role restrictions separately from the unchanged
Cedar schema and defaults. Generation validates exact Editable coverage, all six
fixed ranks and each approved floor before writing any selected output; it does
not silently derive or repair the authored decision when grants change.

Each generated action has discriminated `minimumRole` metadata: `approved` with
its fixed role/rank, `locked` for non-Editable actions, or `unresolved` for
`VisitorRecord.Read`. The visitor action has no floor or default grant; its
eligibility question remains pending. Future permission editing must admit only
`approved` metadata and refuse `unresolved` or `locked` entries, including for
Admin. This metadata grants no action and changes no current application access.
Existing Lead default exclusions, per-field visitor reader restrictions and all
policy guardrails remain intact. The exact approval and remaining question are in
the [minimum-role decision record](../../remediation/reports/P11/minimum-role-decision.md).

`tools/generate-grants.mjs` produces one static permit for each of the 47
Editable actions. Per-event role grants remain entity data. There are no
runtime policy templates or policy-store writes: ADR-005 §2 replaces the earlier
template design with audited `RolePermission` rows. Those rows, grant versions,
entity construction, local/AVP adapters and enforcement remain later work.

The local Node 24 policy suite uses Cedar WASM 4.13.0 and makes no AWS or database
calls. It strict-validates the policies, compares all 156 capability-matrix cells
with the current shared oracle, tests approved C1–C13 behavior and verifies
forbid precedence, foreign-resource denial, station/attendance ownership,
capture lifecycle and locked actions. The original matrix fixture's path was
updated for P09's `packages/shared/src/access/capabilities.ts` move.

The fixture harness in `lib/bench.mjs` is for policy tests. It is not a production
entity builder. In particular, phase, late-sync admission, current membership,
station assignments, attendance and platform authority must come from current
server-owned data, with the existing lifecycle and transaction safeguards.
Current application authorization remains in force while P11 integration is open.

The P05 byte-correspondence assertion records this unchanged port. A later
reviewed policy change must deliberately update that assertion and its approval
evidence; the historical P05 files are not edited to make the assertion pass.
