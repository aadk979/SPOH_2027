# The authorizer abstraction (P11.4) — 7 October 2026

The owner chose P11.4 as the next milestone on 7 October, from the handoff's
candidates (P13.6 external evidence and P11.4+ adapters), on the recommendation
that it needs no further decision and changes nobody's access. It builds the
engines ADR-005 §6 describes. **No route calls them yet**: `requireCapability`
and `requireStationScope` still decide every request until P11.5 replaces them
in one reviewed step, with the `CHANGES.md` cells.

## What was built (`server/src/platform/access/authorizer/`)

- **`Authorizer`** (`isAuthorized`, `batch`) over one request shape: principal,
  action, resource, context and entities in Cedar JSON. Both engines receive
  exactly the same values. Any evaluation error denies: a `forbid` that errors is
  skipped by Cedar, and a skipped guardrail must never allow.
- **`LocalCedarAuthorizer`**: Cedar WASM 4.13.0 over the policy files bundled in
  the image. The schema and the 71 policies are parsed once; every request is
  validated against the schema.
- **`AvpAuthorizer`**: `IsAuthorized` with the entities and context as `cedarJson`,
  so AVP receives the same JSON the local engine evaluates rather than a
  hand-translated copy. 200 ms per attempt and one retry (ADR-005 §6), with the
  SDK's own retries off. Throttling, server faults, timeouts and network errors
  retry; a missing store or a denied role does not; AVP's `ValidationException`
  denies. When AVP cannot answer it throws `AuthorizerUnavailableError` (503,
  `SERVICE_UNAVAILABLE`), never a 403. AVP names policies by store ids, so it takes
  a map back to the `@id`s (P11.6 supplies it from CDK); unmapped ids read
  `avp:<id>`. `batch` makes single calls: ADR-005 §6 prices `BatchIsAuthorized` at
  30 times a call, and UI affordances use the local engine.
- **`DecisionCache`**: 30 s for `Write` actions, 60 s for reads, bounded at
  10,000 entries, cleared per event by the `access` and `membership` bus channels.
  The key is a hash of the complete evaluation input, every entity attribute
  included, rather than the membership and grant versions ADR-005 mentions: those
  versions do not exist yet, and a full-input key cannot serve a stale answer
  after a role, shift, phase or grant change, because the input differs. Decisions
  with errors and degraded decisions are not cached.
- **`CircuitBreaker`**: open after 5 failures in 10 s, one probe after 30 s.
- **`ResilientAuthorizer`**: cache, then AVP behind the breaker, then the local
  engine only where ADR-005 §6 allows it: Capture and Self; Safety's report and
  raise (`Incident.Report`, `LostPerson.Raise`, the ADR's "report, raise, ack");
  reads in Report and Safety. Everything else fails closed with the 503. The
  24 degradable actions are pinned by a test. A degraded decision logs
  `authorization degraded to the local engine` for the metric filter and alarm
  P11.9 adds.
- **`EntityBuilder`**: one per request, reading inside the caller's transaction:
  the membership (role, rank, status, assigned and on-shift stations, working days,
  today's attendance in the event's capture mode, attendance root), its person
  (platform admin through the event's organisation), its role and the context
  (phase, late sync, trusted network, granted rank). It loads every schema
  resource type with the attributes the policies read. Every lookup names the
  event (ADR-001 §2): a row of another event is not found (404) rather than loaded.
- **`createAuthorizer`**: the local engine where no policy store is configured,
  otherwise AVP behind the cache (subscribed to the bus) and breaker.

Supporting changes:

- `@spoh/access-policies/policy-set` reads the schema, the policies keyed by `@id`
  and the default grants from the package. The package root stays metadata only,
  so nothing that imports the catalogue loads Cedar.
- The attendance root and trusted-network readers moved from the attendance
  module to `platform/event/attendanceAuthority.ts`, unchanged, so the builder
  and the attendance rules read one definition.
- `npm run build:shared` also builds the policy package, which the server now
  compiles against. CI's separate build step for it went, and the image builds it,
  installs its runtime dependencies and copies its schema, policies, default
  grants and output.
- The server depends on `@aws-sdk/client-verifiedpermissions` 3.1123.0 (the
  version of its other AWS clients), Cedar WASM 4.13.0 (as the policy package)
  and the policy package. The install also collapsed 25 nested copies of
  `@smithy/types` 4.17.2 into one 4.19.0; every dependent's range is `^4.x` and
  `npm ls` is clean. The dependency audit passes; its one high finding is the
  existing dated `aws-cdk-lib` exception.

## What it does not do yet

- **Role grants.** There is no `RolePermission` model (the prerequisite report
  left it as a dependency). The builder takes grants from a `RoleGrantSource`; the
  only one is the approved `default-grants.json`. The table and its reader come
  with P11.5/P11.7, as a database change in two releases.
- **Organisation-level requests** without an event (`Platform.CreateEvent` and the
  rest) need a builder of their own; the event builder answers them only for the
  event's own organisation.
- **People** have no deactivation of their own; a person is `active` and the
  membership's status carries deactivation, until P12's person lifecycle.
- **Real AVP.** No policy store exists (P11.6). The contract test below proves the
  request the adapter sends and how it reads the answer, against a stand-in.

## Verification

Locally, on Node 24.19.0 (CI's version), for `f1f0222`:

- **Contract.** The policy package's suite (80 checks) records every request it
  evaluates, 343 of them across 57 actions (159 allow, 184 deny). Both engines
  reach every recorded decision for the same determining policies; the AVP
  adapter goes through a stand-in that parses its exact `IsAuthorized` input
  (`cedarJson`, store-generated policy ids) and evaluates it with Cedar. Two
  deliberate breaks of the adapter were caught: dropping the policy-id map, and
  forcing the event phase to `LIVE`. A third, forcing `onTrustedNetwork` off,
  passed, correctly: no policy reads it yet.
- **Units.** 28 adapter cases: decisions and deciding policies, schema-invalid
  requests deny with their errors, the exact AVP input, an `ALLOW` with errors
  denied, throttle and server-fault retries, timeouts that abort, no retry for a
  missing store, `ValidationException` denied, the breaker's open/probe/close,
  the cache's key, lifetimes, bound and bus clearing, the 24 degradable actions,
  degraded capture logged, a correction failing closed with 503, the breaker
  stopping calls, and the factory.
- **Database.** 16 entity-builder cases on the real schema: role, grants and
  stations on shift; off shift and away; a late sync judged at its recorded time;
  today's attendance, the root and trusted networks; a deactivated membership; a
  stable decision key; every resource type with the attributes and parents the
  schema declares, evaluated without errors where an action applies; a missing
  recorder denied by the schema check; a row, an event or an organisation of
  another event not found; platform admin through the organisation only. The
  privacy-setting case shows the policy already refusing `Settings.ManagePrivacy`
  to an event Chief (ADR-005 §5); nothing enforces it until P11.5.
- **Image.** A local build of the Dockerfile bundles the package: inside it the
  local engine allowed an on-shift volunteer (`grant.Registration.Create`),
  refused an off-shift one (`station-scope.capture`), loaded 71 policies and
  resolved the AVP client.
- **Gate.** Server unit 766; the full server integration suite 1981 passed with
  the 4 existing skips (release B had 1965; the 16 are the builder's); shared
  251; client 646; the policy package 80 in 5.0 s. Coverage on the unchanged
  floors: server 96.06 % lines / 87.62 % branches (floors 95.2 / 86.19), client
  75.18 / 69.15, shared 92.19 / 82.72. Every new file covers 92.7 % of lines or
  more; the rest of `avpAuthorizer.ts` is the real SDK client factory. Types (all
  workspaces), lint, architecture (1214 modules), hardcoding, generated settings,
  generated actions, formatting, whitespace and the dependency audit pass.
- **Browser.** The attendance (2) and admin (8) journeys, which run through the
  moved attendance readers, pass on a fresh API. On a fresh static export all
  100 visual checks pass with no baseline changed.

Mistakes on the way, corrected before the commit: Python edits on Windows wrote
CRLF into three files, `ci.yml` among them (restored to LF and checked with
`git ls-files --eol`); the first builder looked rows up by id alone, which the
event-scope guard rightly refused, so every lookup now names the event; a test
named the retention setting by the bench's old key.

## Release

One release, with no expand/contract pair: nothing in the database or the API
changes.

- CI: full run 37618823689 passed; deployment 37619980354 passed.
- Staging, task revision 148, image `f1f0222` (digest
  `sha256:b9dbbc2d9ee5b165f6b9496f1ea4ff0d4104315218cc79e12d5bc71a5ae2a624`): the
  migrate task logged nothing to apply. Before the push, a normal Cognito session
  recorded a baseline on `58906e5` (task 147): the smoke identity's role (ADMIN),
  its 26 server-computed capabilities, and the statuses of ten probes. After the
  release the same session found the same role, the same capabilities and the same
  statuses: eight reads 200, the legacy GET and PATCH 404. The settings screen
  loaded, no request failed with 429 or 5xx, and sign-out answered 204. One probe,
  `/roster/volunteers`, is not a route (404 on both) and proves nothing; the other
  nine do.
- [Evidence](staging-authorizer-evidence-2026-10-07.json).

## Next

P11.5 enforcement: the `RolePermission` model and reader (a database change, in
two releases), `authorize(action, resolveResource)` on every route, the
`CHANGES.md` cells, denial audit and the generated route matrix. It narrows
`Settings.ManagePrivacy` (lost-person retention and visitor data) to platform
admins, as approved. The visitor portion still waits on D-15.
