# ADR-005 — Authorization on Amazon Verified Permissions

| Field     | Value                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status    | Proposed (P05.6, 2026-09-26)                                                                                                                                                                                                             |
| Decisions | D-03 = A (owner). D-06 = A, with local evaluation for UI affordances (design). The AVP latency measurement is **not done**: it needs an AWS policy store, which D-13 rules out (question Q-P7)                                           |
| Resolves  | F03-001 (the structural fix), F04-004, F04-005, F04-024, F03-016, F02-020, F02-025, F02-030, F02-031 (with P11.7 and P11.8), F01-021; the matrix oddities in F02 § P02.9 and F03 § P03.1; the 12 rules outside middleware in F04 § P04.3 |
| Evidence  | [`remediation/reports/P05/cedar/`](../../remediation/reports/P05/cedar/): the schema, 5 hand-written policy files plus the generated grants, and **51 passing local tests** (Cedar WASM 4.13.0)                                          |
| Builds in | P11.1–P11.10, P15.5                                                                                                                                                                                                                      |

## Context

Authorization today has four layers, each in a different place:

- a compiled **capability matrix** (26 capabilities × 6 roles, `packages/shared/src/capabilities.ts`),
  checked by `requireCapability` on 83 routes;
- a **station scope** in `middleware/rbac.ts`: capture needs a running shift at the station in
  Singapore time, and IC and above bypass it, with the bypass audited;
- **rules in services**: who may edit whom (on the admin screen's path only, so the roster import
  skipped them: F03-001), announcement audiences, own-shift checks, briefers, the attendance root
  (twelve rules, F04 § P04.3);
- **client guesses** from the same matrix, with route guards that check only that someone is
  signed in (F02-025, F02-030).

The owner chose **D-03 A**: a fixed role catalogue, renameable per event, whose actions admins can
edit per event, with locked guardrails. The programme puts policies in Amazon Verified Permissions
(AVP), in Cedar.

**Cost matters here** (D-10: US$100/month for everything). The AWS Price List for AVP in
ap-southeast-1 (`AmazonVerifiedPermissions`, version `20260911124513`, fetched 2026-09-26):

| Request                                       | Price                                                               |
| --------------------------------------------- | ------------------------------------------------------------------- |
| Single authorization (`IsAuthorized`)         | US$5.00 per million                                                 |
| Batch authorization (`BatchIsAuthorized`)     | **US$150 per million** (first 40 M), US$75 (next 60 M), US$40 after |
| Policy management (Create, Update, Get, List) | US$40 per million                                                   |

## Decision

### 1. Model: who, what, on what, when

- **Principals.** In an event the principal is a **`Membership`**: who you are in this event, with
  `role`, `rank`, `active`, `assignedStations`, `onShiftStations`, `workingDays`,
  `attendanceVerifiedToday`, `isAttendanceRoot` and `event`. Platform actions take a **`Person`**
  (`active`, `platformAdmin`). The entity builder computes the attributes per request from the
  database. `onShiftStations` comes from the `Shift` rows running now in the event's timezone
  (ADR-002). Nothing is read from the token except the identity, as today.
- **Resources.** Every event resource is `in` its `Event` (and its `Station` where it has one):
  `Registration`, `MissionCard`, `Incident`, `Announcement`, `ShiftAssignment`, `Setting` and the
  rest. Collection actions ("list incidents", "generate the report") take the `Event` itself.
- **Actions.** 65 actions in eight functional groups (`Capture`, `Correct`, `Safety`, `Self`,
  `Report`, `Manage`, `Configure`, `Platform`), plus two cross-cutting groups: `Editable` (46
  actions a role's grants may toggle) and `Write` (changes state). The schema is generated into
  `@spoh/shared/generated/actions`, which replaces the `Capability` type (P11.1).
- **Context.** `eventPhase` (ADR-004), `lateSyncAllowed` (ADR-004 §1), `onTrustedNetwork`, and
  `grantedRank` for role grants.

### 2. Role permissions are data, not app-written policies

D-03 A needs admins to change, per event, which actions each role may perform. The plan (P11.7)
proposed template-linked policies that the app writes into AVP. **This ADR does it with data
instead:**

- A generated **static policy per `Editable` action** permits it when the principal's per-event
  role lists it:
  `permit (principal is SPOH::Membership, action == SPOH::Action::"Registration.Create", resource) when { principal.role.grants.contains("Registration.Create") };`
- Which role holds which action is **`RolePermission`** rows (`eventId`, `role`, `action`). They
  are materialised into the `Role` entity's `grants` on each request, and new events start from
  `default-grants.json`. An admin's toggle is a database write, audited, that publishes on the
  `access` bus channel (ADR-003).
- The per-event **role label** ("IC" → "Station lead") is on the same row set.

Why:

1. **The app never writes policies.** Its IAM role needs only `IsAuthorized`. A compromised app
   cannot create a `permit (principal, action, resource);`, because policies change only
   through a reviewed commit and a CDK deploy. Template links written at runtime would need
   `CreatePolicy` in the app's role.
2. **Guardrails cannot be granted away.** A grant is only ever an input to a `permit`. Every
   `forbid` still applies (tested: granting a Volunteer `People.Deactivate` still cannot deactivate
   a peer).
3. **Cloning is copying rows** (ADR-001 §6). The policy store never holds per-event state, so it
   has no per-event quota and drift is trivial: the store equals the repo, always.
4. **One policy set for every environment and engine** (§6).

### 3. Policy layout (all static, in `packages/access-policies/policies/`)

| File                     | Layer               | What it guarantees                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grants.generated.cedar` | 1. role permissions | an Editable action is allowed only if the event's role grants it                                                                                                                                                                                                                              |
| `station-scope.cedar`    | 2. station scope    | capture only where you are on shift (in `REHEARSAL`: where you are assigned); `anyStation` roles capture anywhere, and the PEP audits the bypass; an IC's roster reads and station sends stay on their stations (F04-004, F04-024)                                                            |
| `guardrails.cedar`       | 3. locked `forbid`s | inactive members and people do nothing; a membership never reaches another event; not on yourself; only on lower ranks; never grant a rank at or above your own; capture only while capturing; `ARCHIVED` is read-only; structure frozen from `LIVE`; locked actions only for platform admins |
| `self-service.cedar`     | self                | your own record and shifts; check-in needs today's attendance and a running shift; the briefer only (F03-016); an announcement's audience only (F04-005)                                                                                                                                      |
| `attendance.cedar`       | attendance gate     | verifying others needs your own verification today, or the root flag (F02-017)                                                                                                                                                                                                                |
| `platform-admin.cedar`   | platform            | platform actions; the locked actions (permission edits, security and privacy settings, reopen, archive); only a platform admin can create an event Admin                                                                                                                                      |

Every policy has a header comment saying what it guarantees and why (P11.2). The reporting-cycle
check stays in the domain, because it is a graph walk, not an authorization rule.

### 4. Roles and ranks

The catalogue is fixed (D-03 A): Volunteer, IC, Deputy Coordinator, Chief Coordinator, Lead,
Admin. `rank = 60 − ROLE_PRECEDENCE` keeps today's ordering (Admin 60, Lead 50, Chief 40, Deputy
30, IC 20, Volunteer 10), so "who may edit whom" is unchanged (Lead still outranks Chief).
`anyStation` is true for IC and above, as `roleMeets(role, 'IC')` is today. Each `Editable` action
declares a **minimum role** in the catalogue, and the permissions screen will not grant it below
that (for example, no `People.*` for Volunteers). Guardrails make such a grant harmless anyway, but
the floor prevents confusing grants.

### 5. From today's 26 capabilities

Each capability maps to one primary action with the **same six cells**, and `tests/matrix.test.mjs`
proves all 26 against `capabilities.ts` itself. Some capabilities also split into finer actions:

| Capability                                                            | Cedar actions                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration.create`, `footfall.create`, `card.stamp`, `gift.redeem` | `Registration.Create`, `Footfall.Create`, `Card.Stamp`, `Gift.Redeem` (Capture)                                                                                                                                             |
| `record.void`, `count.adjust`, `card.reissue`                         | `Record.Void`, `Count.Adjust`, `Card.Reissue` + `Card.Void` (Correct)                                                                                                                                                       |
| `incident.report`, `incident.resolve`                                 | `Incident.Report`; `Incident.Read` + `Incident.Update`                                                                                                                                                                      |
| `lostPerson.raise`, `lostPerson.resolve`, `lostFound.log`             | `LostPerson.Raise`, `LostPerson.Resolve`, `LostFound.Log` + `LostFound.Claim`                                                                                                                                               |
| `own.read`                                                            | `Self.Read`, `Shift.CheckIn`, `Swap.Request`, `Briefing.Complete`, `Announcement.Ack`, `Alert.Ack`, `Attendance.Submit` (Self, locked)                                                                                      |
| `dashboard.station.read`, `dashboard.event.read`                      | `Dashboard.ReadStation` + `Roster.ReadStation`; `Dashboard.ReadEvent`                                                                                                                                                       |
| `swap.approve`, `roster.edit`                                         | `Swap.Decide`; `Roster.Edit` (no role changes)                                                                                                                                                                              |
| `announcement.station.send`, `announcement.event.send`                | `Announcement.SendStation`, `Announcement.SendEvent`                                                                                                                                                                        |
| `fallback.declare`, `fallback.import`, `report.generate`              | `Fallback.Declare`, `Fallback.Import`, `Report.Generate` + `Report.Export`                                                                                                                                                  |
| `user.read`, `user.provision`                                         | `People.Read` (+ `Structure.Read`); `People.Invite`, `People.Update`, `People.Deactivate`, `People.AssignRole`                                                                                                              |
| `config.manage`                                                       | `Structure.Edit`, `Structure.Change`, `Card.GenerateBatch`, `Content.*`, `Schedule.Manage`, `Settings.ManageEvent`, `Event.MarkReady`, `Event.Rehearse`, `Event.GoLive`, `Event.Close`                                      |
| `audit.read`                                                          | `Audit.Read`                                                                                                                                                                                                                |
| _new_                                                                 | `LostFound.CloseOut`, `VisitorRecord.Read` (ADR-002), `Settings.ManageSecurity`, `Settings.ManagePrivacy`, `Permissions.Edit`, `Event.Reopen`, `Event.Archive`, `Attendance.IssueCode`, `Attendance.MarkRoot`, `Platform.*` |

**Every intentional change is in [`CHANGES.md`](../../remediation/reports/P05/cedar/CHANGES.md)**
(C1–C13), each with its reason and its test. The owner's approval of that list at G1 is the
approval P11.3 requires. The most visible changes:

- a Deputy can no longer set roles through the roster import;
- nobody grants a role at or above their own, and only platform admins create Admins (F03-001);
- an IC sees and messages only their own stations (F04-004, F04-024);
- the Lead loses lost-and-found close-out;
- privacy and security settings become platform-admin only.

### 6. Evaluation (D-06 = A, with one change)

```
PEP (route middleware / use case)
  └─ Authorizer.isAuthorized(principal, action, resource, context)
       ├─ DecisionCache (per instance, 30 s TTL, bus-invalidated) ── hit ──▶ decision
       └─ miss ─▶ AvpAuthorizer (IsAuthorized, 200 ms timeout, 1 retry)
                     └─ error or open circuit ─▶ per action group: local Cedar, or fail closed
UI affordances: GET /events/:id/me/permissions ─▶ LocalCedarAuthorizer only (same policies)
```

- **Server decisions: AVP is authoritative** (D-06 A). `AvpAuthorizer` calls single
  `IsAuthorized` with the entities the builder assembled. The **decision cache** keys on
  (principal, action, resource, context bucket) plus the versions of the membership and role
  grants. It lives 30 s, and the `access` and `membership` bus channels invalidate it (ADR-003).
  The context bucket includes `eventPhase` and the current shift boundary, so a shift change or
  a lifecycle transition never serves a stale decision.
- **UI affordances do not use AVP.** Batch authorization costs US$150 per million requests, 30
  times a single call. A `/me/permissions` answer covers about 50 actions × the person's stations,
  so at event scale BatchIsAuthorized alone would cost more than the whole budget. The endpoint
  evaluates with **`LocalCedarAuthorizer`**: Cedar WASM running the **same policy files**,
  bundled into the image from `packages/access-policies`. The UI only decides what to show, and
  the server re-checks every action, so affordances computed locally are safe. This replaces
  target-architecture §4's "`/me/permissions` (BatchIsAuthorized)".
- **One policy set, two engines, no drift.** CDK deploys `packages/access-policies` to each
  environment's AVP store (validation `STRICT`), and the image bundles the same files. At boot,
  and in a nightly CI job (P15.5), the app compares a hash of the store's policies with the
  bundled set and alarms on any difference. A contract test (P11.4) runs the policy suite through
  both authorizers.
- **When AVP fails** (timeout, 5xx, throttling, or a circuit breaker open after 5 failures in
  10 s, probed again after 30 s):

  | Action group                                                | Behaviour                                                                                                                    |
  | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
  | `Capture`, `Self`, and `Safety` writes (report, raise, ack) | **degraded local evaluation**: same policies, same entities, decision logged `engine: local`, `authz.degraded` metric, alarm |
  | reads in `Report` and `Safety`                              | degraded local evaluation                                                                                                    |
  | `Correct`, `Manage`, `Configure`, `Platform`                | **fail closed**: 503 "permissions service unavailable", never a 403                                                          |

  Capture never stops because a control-plane API throttles, and nothing that changes people,
  configuration or corrections happens without the authoritative engine.

- **Latency budget:** the capture path's p95 stays under 300 ms end to end (P11.9). The AVP call
  on a cache miss is budgeted at 50 ms p95. The cache hit rate on capture should be 80 % or more.
  **Not measured:** measuring AVP latency from ap-southeast-1 needs a throwaway policy store,
  which D-13 forbids. Q-P7 asks the owner to approve one (created and deleted in a single session)
  in P11.9, or earlier. If the budget is missed, the fallback is D-06 B (local evaluation for
  every decision, with AVP as the store), with no policy change (P11 risks).
- **Expected AVP cost** (an estimate, since P04.8 measured captures only):
  - **Peak load:** about 50 authenticated requests a second, from P04.8's poll rates:
    - 30 coordinators on the 3 s dashboard poll: 10/s;
    - 300 volunteers on the 10 s alert poll: 30/s;
    - captures: about 10/s.
  - **January volume:** about 45 event hours (Dry Run #2 and four event days), so about **8 M
    requests**.
  - **Cost:** a 30 s cache answers at least two of every three identical polls. At a 70 % hit
    rate, that is 2.4 M `IsAuthorized` calls, **about US$12**. The worst case, with no cache
    hits, is US$40.
  - **Off-season:** cents.

  ADR-008 carries the figure, and P16.2 replaces the estimate with a measurement.

### 7. Editing, explaining, testing

- **Admins edit** (P11.7) per event: the roles list in plain language, grouped by action group,
  with toggles per `Editable` action above the action's minimum role. Guardrails are shown
  read-only, with their explanation. Only platform admins can change grants
  (`Permissions.Edit`, locked). Every change is audited with the before and after grant sets.
- **The simulator** answers "Can ⟨person⟩ do ⟨action⟩ on ⟨resource⟩ now?" with the decision and
  the determining policy ids and their header comments. For example: denied by
  `guardrail.outrank-target`, "only people below you". It also answers "What can ⟨person⟩ do?".
  It runs on the local engine, so it costs nothing to use.
- **Denials explain themselves** (F02-030). The API returns the determining policy's reason code,
  the client shows it, and "not allowed" never reads as "offline" (P11.8, P14.4).
- **Tests.**
  - The policy suite: table-driven, local, under 10 s, no AWS. It covers validation, the 26 × 6
    port, every CHANGES row, the guardrails, station scope, lifecycle windows, attendance and
    ownership.
  - A route × role × phase matrix generated from the route inventory (P11.5).
  - The authorizer contract test.
  - A nightly run against staging's AVP store (P15.5).

## Options considered

| Topic                      | Chosen                                                                       | Rejected, and why                                                                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-event role permissions | grants as entity data plus a generated static permit per action              | template-linked policies written by the app (the plan): the app's IAM role could write any policy, and it adds per-event policy state, links to clone and drift to manage. Fully custom roles (D-03 B): not chosen by the owner, and still addable later as data |
| Server evaluation          | AVP per decision with a cache; local when degraded, for safe groups (D-06 A) | local always, AVP only as the store (D-06 B): cheaper and faster, but AVP would add nothing at run time. It remains the measured fallback. AVP with no cache (D-06 C): cost and latency on every poll                                                            |
| UI affordances             | local Cedar with the same policies                                           | `BatchIsAuthorized`: US$150 per million, more than the monthly budget at event scale. A client-side matrix: the client would evaluate policy itself (target-architecture §4 forbids it)                                                                          |
| Station scope              | a `forbid` with `anyStation` and a rehearsal clause                          | a permit per station: the policy set would grow with every station                                                                                                                                                                                               |
| Platform admin             | a `Person` principal with `platformAdmin`, plus read-only `AdministerEvent`  | a hidden seventh role in every event: platform powers would leak into event role editing                                                                                                                                                                         |

## Consequences

- One source of truth for every allow and deny, and the UI shows only what the server will allow.
- Twelve scattered rules move into policies or tested domain functions. The roster import can no
  longer escalate (F03-001).
- The PEP must build complete entities for every decision: the membership, its role grants, the
  resource and its parents. That is a few indexed reads, cached per request, and the cost of
  making decisions explainable.
- Two engines must stay identical, which the hash check and the contract test enforce.
- Some people lose access they have today (CHANGES.md). The owner approves each one.

## How it is tested

The P05 bench already runs **51 tests** (`npm test` in `remediation/reports/P05/cedar`):

- strict validation of all policies against the schema;
- the 26-capability port, read from `capabilities.ts`;
- one test per CHANGES row;
- the guardrails (same event, self, outrank, grant ceiling, inactive, archived, structure
  frozen, grants cannot bypass a guardrail);
- station scope, attendance and check-in.

A mutation check (deleting `guardrail.outrank-target`, or granting a Lead `Record.Void`) made the
suite fail. P11.3 moves the suite into `packages/access-policies/tests` and runs it in CI. P11.4
adds the authorizer contract test, P11.5 the generated route matrix, and P11.9 the latency and
failure drills.

## Migration

1. **P11.1–P11.3:** move the bench into `packages/access-policies`. Generate the action catalogue
   and the grants from the schema. Port the tests. Seed `RolePermission` for Event #1 from
   `default-grants.json`, which reproduces today's matrix plus CHANGES.md.
2. **P11.4–P11.5:** `Authorizer` with both engines. Swap `requireCapability` and
   `requireStationScope` for `authorize(action, resolveResource)` on every route, together with
   the use-case checks for resource-dependent rules. Delete the RBAC middleware. The
   `CHANGES.md` cells change here, in one reviewed step.
3. **P11.6:** the AVP store per environment via CDK, and the drift check.
4. **P11.7–P11.8:** the permissions screen and simulator. `/me/permissions` on the local engine.
   Delete `CAPABILITY_MATRIX`.
5. **P11.9:** measure latency (after Q-P7), drill AVP failure, add alarms.
