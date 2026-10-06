# P11 policy prerequisites — 6 October 2026

This is bounded P11.1–P11.3 work authorized by ADR-010. P10, P11 completion,
G3–G5 and production approvals remain open. No adapter, enforcement point,
database model or cloud policy store changes in this milestone.

## Verified inputs

- Git HEAD and origin/main matched `a0d0c3acfde7de3c6b6a4a5d14de9d56df068db2`
  before edits. The inherited editor files were present and untouched.
- Read the process handoff, ADR-010, current tracker and decisions, engineering
  standards, P11 phase plan, ADR-005 and P05 schema/policies/default grants/C1–C13.
  G1 approved that policy model and its intentional permission changes.
- P09 is complete. Reviewed its verification report and current event, person,
  membership, station, shift and attendance model plus existing capability/RBAC
  oracle tests. The capability source now lives under `shared/src/access/`.
- Reviewed current P10 event-first/current-membership settings authority,
  `access`/`membership`/`event.state` cache channels, scheduler authority and
  lifecycle contracts. First LIVE and public archive remain guarded; policy
  permission is not proof of lifecycle readiness or permission to cut over.
- Current Prisma has no `RolePermission` model or role-grant versions. This
  leaves a concrete later dependency for P11.4/.7 instead of inventing grants
  from tokens, trusting caller-supplied attributes or changing enforcement now.

## Implemented

`packages/access-policies` preserves the accepted architecture and the historical
bench. Schema, policy files, role defaults and CHANGES.md are byte-identical to
P05. The local harness and existing tests were ported; the matrix oracle path and
repository-relative depth were corrected in the copy only. Strict validation,
static grant generation and each policy's guarantee header remain intact.

A deterministic generator creates a TypeScript action catalogue with 65 actions,
46 Editable actions, Write membership, ten groups and declared principal/resource
types. Its standalone exports have no Cedar/AWS dependencies or decision logic.
The default invocation generates and checks only the package's own output.

The deliberate `--shared-output` option additionally selects the fixed sibling
`packages/shared/src/generated/actions/index.ts`. Combined with `--check`, it
checks both selected outputs without writes, repairs or directory creation.
Unknown/path-bearing options fail before writing. The worker did not invoke that
option against the real shared tree: CLI boundary tests use isolated mock
repositories inside the owned package's ignored `.local`, with resolved cleanup
paths verified before recursive removal.

Twenty additional checks cover catalogue/schema correspondence, generation
freshness, locked identifiers, authored asset correspondence and header comments;
all 46 Editable actions against each declared foreign resource type with every
grant present; all four Capture actions across six phases and both late-sync
states; foreign-event locked actions for platform-admin memberships; deactivated
platform admins; and locked-action strings added to role data.
The additional generator checks cover default output isolation, explicit shared
output equality, missing shared output, independent package/shared drift,
read-only check behavior and invalid option fencing.

## Approved minimum roles and remaining visitor decision

ADR-005 §4 requires fixed minimum roles. The accepted schema and initial defaults
did not uniquely determine them, so the worker prepared the complete 46-action
[decision proposal](minimum-role-decision.md). On 6 October the human owner chose
**“Approve lowest-default floors (recommended)”** for the 45 actions with defaults.
`minimum-roles.json` now authors those exact restrictions. The generator validates
that they cover the approved Editable actions, use the six fixed roles/ranks and
match the approved lowest defaults; missing, lower, higher, unknown or overlapping
declarations abort before writing either output. Floors are never repaired or
derived from mutable event grants.

Each action's generated `minimumRole` is explicitly `approved` with role/rank,
`locked` for non-Editable actions, or `unresolved` with no invented floor for
`VisitorRecord.Read`. The visitor eligibility question remains pending and all
six defaults remain ungranted. Future permission editing must refuse unresolved
and locked metadata, including for Admin. Existing field-reader access and all
policy/default-grant bytes remain unchanged; no current enforcement migration or
phase completion is implied by the 45-floor approval.

## Focused local verification

Node `24.19.0`, Cedar WASM `4.13.0`:

- Unmodified historical bench: 24 passed, one matrix file failed to load its
  pre-P09 capability path. This failed run is excluded from acceptance and the
  historical bench remains unchanged.
- Ported package: **65 passed, zero failures/skips**, 3.30 seconds. This includes
  all original 51 checks and all 156 original matrix cells against current source.
  Policies validate in Cedar STRICT mode without warnings.
- Package TypeScript no-emit check and focused ESLint pass.
- Both default generation freshness checks and focused package/report formatting
  and owned-text whitespace checks pass. After the shared-output boundary work,
  all **71 checks** pass in 3.96 seconds. No broader application evidence is claimed.
- With the approved fixed-floor metadata, **79 checks** pass in 5.76 seconds,
  including lower/higher substitutions across every approved floor, unknown or
  locked actions, incomplete/overlapping declarations, changed ranks/provenance,
  all six attempted visitor floors, changed defaults, nonmonotonic Lead defaults
  and no-write generator failure. Package no-emit TypeScript and focused ESLint
  pass. Approved schema/policies/defaults/CHANGES.md remain byte-identical to P05.
- The completion review found that the unchanged C8 row cited the matrix port,
  but that matrix maps configuration to `Structure.Edit` and does not evaluate
  `Card.GenerateBatch`. A direct C8 regression now evaluates that action on a
  valid event in DRAFT for every default role: Chief/Admin allow, the other four
  deny; positive decisions identify `grant.Card.GenerateBatch`. The affected
  changes file has **20 passing checks** in 2.36 seconds, and the complete pure
  package has **80 passing checks** in 6.85 seconds, without failures/skips or AWS
  access. This corrects the evidence gap without changing accepted CHANGES.md,
  schema, policies or grants. The actual CI duration requirement remains open.

The dependency install used the package prefix, disabled workspaces, lifecycle
scripts and lockfile writes. Only owned package files/node_modules changed; the
root lockfile is left to the coordinator. No shared database/browser suite,
application build, Prisma generation, migration, reset, seed, AWS request or
production operation was run by this worker.

## Coordinator integration and remaining acceptance

1. Register the new wildcard workspace in the root npm lockfile with a root
   `npm install --package-lock-only --ignore-scripts`, then verify `npm ci`.
   The existing `packages/*` workspace glob already includes this directory.
   Cedar remains
   pinned to the accepted 4.13.0; retain existing dependencies and coverage floors.
2. Integrate the schema-derived standalone output into the shared generated
   actions export under the coordinator's shared/generated ownership by invoking
   `node packages/access-policies/tools/generate-actions.mjs --shared-output` from
   the repository root. Expose the generated shared export and retain the existing
   capability API during the deliberate enforcement migration. Add the matching
   `--shared-output --check` command to required validation.
3. Add `npm run build --workspace packages/access-policies` to full CI's quality
   job, which checks both generators and compiles the standalone catalogue.
   Add `npm run test --workspace packages/access-policies` as an explicit full
   CI test step. The current root workspace typecheck already includes the new
   package, but CI names the three application suites and does not automatically
   execute this package's tests. No source imports it yet, so root application
   build order does not need to change for this prerequisite milestone.
4. Run the required full CI gate and milestone acceptance after serial browser
   work permits builds. The local suite's under-10-second measurement is not yet
   an observed CI result. Track P11.1/.3 as partial until their full criteria hold.
5. Continue actual entity-building, grants persistence, local/AVP adapter contracts,
   denial audit, enforcement migration, store deployment, permission UI and
   performance/failure acceptance. Keep lifecycle/business-rule checks and
   platform/organisation scope authority explicit at those boundaries.
   The 45 approved floors are now an explicit catalogue contract. Resolve the
   remaining `VisitorRecord.Read` eligibility decision before completing its
   permission toggle or enforcement migration; until then its metadata remains
   unresolved and must fail closed for future permission editing.

## Coordinated prerequisite integration

The coordinator registers the wildcard workspace in the root lockfile, copies its
manifest into Docker's clean installation stage, exposes the schema-derived
metadata from the shared root and `@spoh/shared/generated/actions`, and adds
generated freshness, package build and policy tests to full application CI.
The existing capability API and all runtime authorization stay in place until
the deliberate P11.5 migration. Static metadata introduces no Cedar/AWS runtime
into shared or the client and does not authorize any request.

Meaningful shared public-export tests verify all 65 schema identifiers and
metadata partitions alongside the retained capability defaults. The fresh shared
whole-package measurement passes **193 checks across 17 files**, with 471/516
maintained lines (91.27%) and 146/179 branches (81.56%). Root generated consistency,
shared/policy builds, full workspace types, full lint and application architecture
checks pass. Full CI, observed under-ten-second policy tests and exact-image
staging acceptance remain the release criteria before prerequisite step closure.

No P11 step or phase is marked complete by this report yet, and no staging or
production authorization behavior is claimed.
