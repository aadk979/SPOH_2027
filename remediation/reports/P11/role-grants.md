# Role grants as data — 8 October 2026

P11.5's enforcement reads each event's role grants (ADR-005 §2), and no model held
them. This milestone stores them in two releases, without changing what anyone
sees or may do: `requireCapability` still decides every request until P11.5's
reviewed enforcement step, which the owner sees before it ships.

## Release A — the table and the defaults (`eddbc88`)

- `RolePermission` (event-owned): one row per Editable action an event grants a
  role, unique per event, role and action. The rows are an input to the static
  permits only, so no grant can lift a guardrail.
- Migration `20261008090000_role_permission` creates it.
  `20261008090100_seed_role_permissions` gives every event without grants exactly
  the 156 approved defaults of `default-grants.json` (none of them
  `VisitorRecord.Read`). It is re-runnable, leaves an event that has grants alone,
  and fails, writing nothing, unless every event it seeds ends with the full set.
  Fed a list with one grant removed, it refused and named both test events.
- New events start from the defaults; a clone copies its source's grants, edits
  included (the defaults when the source has none); the dev seed grants both of
  its events.
- The policy package gains a Cedar-free reader of `default-grants.json`, so
  creating an event reads a file rather than loading Cedar into the server.

## Release B — the repeat and the reader

Prepared, not yet released; see below.

- `20261008110000_repeat_seed_role_permissions` repeats the seed, byte for byte,
  for any event the previous code created while A rolled out.
- `databaseRoleGrants` reads an event's rows in the caller's transaction and is
  the entity builder's default. Whether a role captures at any station stays the
  catalogue's (IC and above). An event without rows grants nothing.

## Verification

Release A, locally on Node 24.19.0:

- Six new database cases: the defaults hold 156 grants and no visitor grant; the
  seed gives each bare event exactly the defaults (312 rows for two events); an
  edited event is left alone and a re-run writes nothing; a new event starts from
  the defaults; a clone copies an edited source; a clone of a bare source starts
  from the defaults. The existing clone tests pass with them.
- Server coverage run: 2754 passed with the 4 existing skips; coverage 96.06 %
  lines / 87.63 % branches (floors 95.2 / 86.19). Client and shared reports were
  reused (their inputs did not change): the ratchet passes for all three.
- Server unit 767, the policy package 80; types, lint, architecture, hardcoding,
  generated settings and actions, formatting and whitespace pass. After the
  migrations the schema and the test database differ by nothing (`prisma migrate
diff` is empty).
- No HTTP route creates or clones an event and no browser fixture inserts or
  deletes one, so no browser journey reaches the new writers. All 100 visual
  checks pass on a fresh static export. The E2E database has both migrations.
- The image was not rebuilt locally: the only packaging change adds a file to the
  policy package's output, which the image copies whole. CI built and deployed it.

Release A on staging:

- Full CI 37719372122 and deployment 37720156495 passed. Task revision 149, image
  `eddbc88` (digest
  `sha256:84cd450fcbd3dbd3369b11c8f9dfc46c7ce490edc018d8f80a876314ae39d627`).
- The migrate task applied both migrations. Prisma does not forward the seed's
  notice, so the evidence for the rows is the migration's success, which requires
  every seeded event to end with the full set.
- A normal Cognito session found the smoke identity's role (ADMIN), its 26
  capabilities and all ten probe statuses identical to the `58906e5` baseline; no
  request failed with 429 or 5xx; sign-out 204. My first run of the script failed
  before reaching staging: I passed a malformed SHA and the preflight refused it.
- [Evidence](staging-role-grants-a-evidence-2026-10-08.json).

Release B's local gate so far: types, lint, architecture, hardcoding, server unit
767 and the 26 affected database cases pass (including: removing a grant row
removes it from the role and the local engine denies; an event without rows
denies; the repeat migration's body equals the seed's and catches a bare event).
Its full server integration and coverage run was stopped by the host for low
memory, not by a failure, and has to be repeated before B is pushed.
