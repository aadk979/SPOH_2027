# P11.5 release 2b — the policies decide (9 October 2026)

**Status: built and verified locally on branch `p11.5-enforce`; not pushed, so not on staging.**
It is pushed to `main` (which deploys staging) only when the D-22 soak has passed: 24 hours of
staging from 13:33Z on 9 October with `AuthorizationFailed` = 0 and `AuthorizationAllowed` > 0
([enforcement-timeouts.md](enforcement-timeouts.md)). Production still waits for the 28 October go
decision.

## What changes

Every route that runs inside a membership is decided by its `authorize` enforcement point. The
capability matrix's guards (`requireCapability`, `requireStationScope`) are off the routes: 138 of
them. Release 3 deletes them and the server's use of the matrix.

What people notice is the approved [`CHANGES.md`](../../../packages/access-policies/CHANGES.md)
rows, as the shadow release measured them: the full integration suite, recorded in shadow on the
current code, found **no evaluation error and no request the old guards refused that the policies
would allow**. The refusals that become real are:

| Change                                                                                                        | Requests in the suite | Answer now                |
| ------------------------------------------------------------------------------------------------------------- | --------------------: | ------------------------- |
| C9: an event Chief or Admin changes a privacy or security setting (retention, visitor data, trusted networks) |                    31 | 403; platform admins only |
| C15: a Chief adds stations, event days or gift types to a LIVE event                                          |                     4 | 409, "the event is live"  |
| C1: someone other than the assigned briefer completes a briefing slot                                         |                     2 | 403                       |

## How a refusal is answered

- **A denial is a 403** recorded in the security audit: `authorization.denied`, severity
  `WARNING`, outcome `DENIED`, the route, the actions and the deciding policies. Identical denials
  (one caller, one route) collapse into one row a minute, and the next row says how many it stood
  for, so a screen polling a refused route cannot flood the table. The window is per process, like
  the rate limits, until P15.2 moves both to Postgres (F03-042). Every denial is also logged.
- **It keeps the reason the screens explain** where a policy names it: `SELF_MUTATION_DENIED`
  (not on yourself), `ROLE_ESCALATION_DENIED` (outrank, grant below your own rank),
  `STATION_SCOPE_DENIED` (station scope), 409 for structure frozen once LIVE, 409 with the
  `platform-admin-required` blocker for reopening (C13), and 404 for an announcement not addressed
  to you, as the inbox always answered (P04.3).
- **Phase and state rules the use cases already enforce go on to them.** A request refused only by
  the capture window, the archived event or check-in's attendance and running shift reaches its
  use case, which enforces the same rule under the phase lock with its own answer: the closing
  grace for a queued capture (the policy's window is coarser and refused a valid pre-close
  capture), `SETTING_LOCKED`, `NOT_ON_SHIFT` as a conflict rather than a permission denial. If a use
  case ever lets such a write through, the server logs `phase guardrail not enforced by the use
case` as an error. Everything about who is asking (role, rank, self, station, grants) is refused
  at the enforcement point.
- **A replay of the caller's settled answer** (a retried capture, a schedule edit after archive) is
  refused for who they are, never for the phase, as the capability check did.
- **When the policies cannot answer**, the request fails closed with a 503 that blames nobody, never
  a 403. A resource the request names that does not exist answers as before (404, 400).
- **A collection read with nothing to ask about** (an empty swap queue, a day that is not an event
  day) answers with the role's grant in that event, or every member for self-service.

ADR-005 §6 records this as an amendment.

## D-15

**A**: `VisitorRecord.Read` takes an owner-decided floor of Volunteer (`ownerFloors` in
`minimum-roles.json`; the generator allows one only for an Editable action no role holds by default)
and still has no default grant. Field reader roles keep deciding every read.

## Tests

- **Route × role matrix**, generated from the route inventory and the default grants and committed
  (`server/tests/integration/route-role-matrix.json`, 140 routes: 99 by granted roles, 35 every
  member, 1 platform admins, 5 decided per request), replaces `rbac.test.ts`. A change to a route,
  an action or a default grant changes the file; the diff is the review. The nine HTTP probes take
  their expectations from it.
- **Coverage test**: every route with a membership has an enforcement point and none has a legacy
  guard.
- **Enforcement tests**: the audit row and its policies, the per-minute collapse, the 503, the empty
  queue answered by the event's grants, an archived capture left to its admission.
- Tests changed to the approved behaviour: C9 settings changed by a platform admin (and a test that
  an event Chief is refused); C15 structure built before go-live (and a test that LIVE refuses it);
  C1 (an IC no longer completes another's wave); C4. Fixtures record the briefer's and the
  assignment's membership, as the app and the P09.4 backfill do. The go-live race tests inject the
  transition after the policies' decision rather than inside the removed guard. "No effect" counts
  leave out the denial's audit row.
- Server: 2798 passed, 4 existing skips; coverage 95.47 % lines, 86.61 % branches (floors 95.2,
  86.19); the ratchet passes. Client 647, shared 251, policies, CDK 73. Types, lint, architecture,
  hardcoding, actions and settings pass.
- Browser, against the release built into the local fixture API (4012): every spec passes run on
  its own: `capture` 7 (including offline capture syncing when the network returns),
  `category-schedule-controls` 4, `capture-schedule-controls` 6, `operational-catalogue-restore`
  4, `lifecycle-reopen` 2, the rehearsal, scheduled-worker, dashboard and visitor specs. The full
  suite in one run: 97 passed, 3 flaky, 4 failed, every failure a 429 or a sign-in timeout on the
  shared fixture accounts' per-minute limits; no request was refused by the policies
  (`authorization.denied` rows: 0). See _Open_ below.

## CloudWatch

The summary is logged as `authorization summary` (it was `authorization shadow summary`); the
metric filters read both names and also count `AuthorizationDenied`, so a mistaken grant shows as a
rise in refusals.

## Open

- **The browser suite's shared accounts.** Now that `capture-schedule-controls` runs to the end
  (it stopped at "Load more" from 6 October until the fix in `7140aaa`), the suite's one admin
  account spends its 300 reads a minute across specs, and a spec whose clean-up meets a 429 leaves
  capture paused for every spec after it. The fixture API now waits out a 429 before retrying,
  which cut the full run's failures from 18 to 4. What remains needs per-spec accounts or a reset
  of the fixture database between specs, and the database has drifted (over a thousand capture
  schedules from repeated runs): reseed it before the next full run. A real admin with the
  schedules screen open and every page loaded makes 83 requests a minute.
- **Release 3** removes `requireCapability`, `requireStationScope` and the server's use of the
  capability matrix, after 2b has run on staging.
