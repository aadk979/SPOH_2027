# P11.5 enforcement, release 1: shadow — 8 October 2026

The owner approved the [release plan](enforcement-release-plan.md) (shadow,
enforce, delete) and confirmed that each organisation has a platform admin to
own the security and privacy settings once C9 applies (D-20). This release
changes no response: the legacy guards and the use cases still decide.

## What was built (`98c816a`, `0754f8d`)

- **`authorize(action, resource)` and `authorizeAll(name, checks)`**
  (`server/src/platform/http/authorize.ts`) on every route that runs inside a
  membership: 139 enforcement points, each ahead of its legacy guard. The local
  Cedar engine decides in a transaction of its own, apart from the request's
  queries. When the request finishes, a decision that disagrees with the app's
  answer is logged as `authorization shadow mismatch`, naming the route, role,
  status, the deciding policies, the `CHANGES.md` rows that explain a difference
  on that route (or `unexplained`) and, for a refusal, whether a legacy guard
  (which enforcement removes) or the use case (which stays) refused. Evaluation
  errors are logged as `authorization shadow error` unless the route refused the
  request as well (400, 403 or 404).
- **Resources** (`authorizeResources.ts`): the event, the caller's membership,
  path and body ids, a person's membership, a card by short code, today's event
  day. A setting's action follows its class: operational `Settings.ManageEvent`,
  security `Settings.ManageSecurity`, privacy `Settings.ManagePrivacy` (C9). A
  lifecycle transition is the action for its target, and LIVE from CLOSED is
  `Event.Reopen` (C13). Editing a member is `People.Update`, plus
  `People.AssignRole` with the granted rank when the role changes (C5).
- **Collection reads** (station summaries, announcement drafts, the swap queue,
  issuing a card at the desk) ask candidate resources and pass when any is
  allowed: the caller's assigned stations, or one station of the event; one
  pending swap request. The accepted schema stays byte-identical to P05; adding
  `Event` as a resource of those actions would have reopened G1.
- **Entity builder:** a CLOSED late sync is judged at the capture's recorded
  time, as `runningShifts` does; an event whose timezone does not resolve
  verifies nobody instead of throwing (its readiness screen reports the
  timezone).
- **Summary** (`0754f8d`): each enforcement point counts its outcome and findings,
  and every five minutes a period with any counts is logged as
  `authorization shadow summary`. Agreement is not logged line by line, so this is
  the evidence that the policies ran (P11.9's metric can read it too).
- **Coverage test** (`authorizationCoverage.test.ts`): every route in the
  inventory has an enforcement point ahead of any legacy guard, except the eight
  that run before there is a membership (session open and close, refresh,
  sign-in handoff, client configuration, dev sign-in, the person's event list).

### Mapping principles

Capture asks about its station; corrections, safety follow-ups and
acknowledgements about their record; event-wide work about the event. A
configuration screen is read with the action that changes it (`Structure.Edit`,
`Schedule.Manage`, `Event.MarkReady`). Self-service reads that every member has
today (`own.read`: inbox, roster, briefing list, notifications, device settings,
visitor fields, stations) are `Self.Read`; their use cases still narrow them.

Two reads only need a membership, because their action is a capture that names a
station they do not have: looking up a mission card and listing gift types. They
are `Self.Read`, so a Lead could also read them. This is not in `CHANGES.md`;
see question 4.

## Findings from the full server suite

The suite was run with `SPOH_SHADOW_REPORT` (2773 tests): 70 findings, none an
evaluation error.

**No legacy-guard refusal was overruled.** Every finding where the policies
would allow but the app refused came from the use case, which stays: rechecks
after the middleware (lifecycle C13, the close and reopen races), IC drafts to
the whole event (C4), a Deputy's import that sets roles (C5), attendance bootstrap
off the trusted network, the visitor and organisation-settings reads that their
use cases limit, and check-out of someone else's shift (C12).

Where the policies would refuse what works today:

| Requests                                                               | Count | Why                                        | Status                     |
| ---------------------------------------------------------------------- | ----: | ------------------------------------------ | -------------------------- |
| Admin/Chief change privacy or security settings (event and attendance) |    31 | `guardrail.locked-actions`                 | C9, approved               |
| Chief or IC completes a briefing slot not theirs                       |     2 | no `self.briefing` permit                  | C1, approved               |
| Configuration reads, writes and replays in an ARCHIVED event           |    12 | `guardrail.archived-read-only`             | question 1                 |
| Chief creates stations, event days or gift types in a LIVE event       |     4 | `guardrail.structure-frozen-when-live`     | question 2                 |
| Admin voids a registration or tick whose `recordedBy` is empty         |     2 | the schema requires it; the request errors | question 3 (test fixtures) |

## Questions before release 2 (enforce)

1. **Configuration in an archived event.** Every configuration screen is read
   with a `Write` action, and an archived event is read-only for `Write` actions,
   so once enforced nobody could read an archived event's settings, categories,
   schedules or lifecycle. The schema has no read action limited to Chiefs and
   Admins. Options: (a) add `Settings.Read` (Editable, Chief and Admin by
   default; reopens G1 for one action and a seed migration); (b) read
   configuration with `Structure.Read`, which lets IC, Deputy and Lead read it;
   (c) accept it. Recommendation: (a). Idempotent replays after archive are a
   separate fix in release 2: a replay returns the stored answer before the
   enforcement point asks, as it already does before the use case.
2. **Structure frozen once LIVE.** The approved guardrail stops anyone
   creating stations, event days, gift types and visitor fields
   (`Structure.Change`) in a LIVE event; relabelling and deactivating
   (`Structure.Edit`) stay. Today a Chief can still create them. It is in ADR-005's approved guardrails but not in `CHANGES.md`. Confirm,
   or lift it for stations and gift types.
3. **Records without a recorder.** P09.4 backfilled `recordedByMembershipId`;
   only test fixtures lack it. Staging shadow logs an evaluation error if a real
   row lacks it; release 2 waits for none.
4. **Card lookup and gift types for Leads.** Confirm that a Lead may look up a
   mission card and list gift types (both are `Self.Read`), or they become
   `Dashboard.ReadStation` on any station, which Volunteers lack.

## Verification

- Server coverage run: 2773 passed with the 4 existing skips; 96.13 % lines,
  87.83 % branches (floors 95.2 / 86.19); the ratchet passes for all three
  packages. Unit tests for the comparison and the questions; builder tests for
  the recorded-time shift and the unresolvable timezone; the coverage test.
- Types, lint, architecture, hardcoding, generated actions and settings pass.
  The two query-count contract tests (F03-029) first failed, because the shadow
  lookups used the request's client; the shadow reads now run in their own
  transaction and both pass.
- The policy package's 80 tests pass with the schema unchanged.

## Staging

- `98c816a`: full CI 37777990848 and deployment 37779523630 passed, task revision 151. The smoke identity's role, 26 capabilities and probe statuses were identical
  to the `58906e5` baseline and a read-only walk of 25 more routes answered as
  before, but CloudWatch held no shadow line: that cannot tell agreement from the
  policies not running, so I added the summary rather than accept it.
- `0754f8d`: full CI 37781500957 and deployment 37782998021 passed, task revision
  152 (digest
  `sha256:4b444c406737fcf4cfb4a7062244a34d776f5e0989dd0288adb2f46b5c4c6f5d`).
  The same comparison and walk passed; no request failed with 429 or 5xx; sign-out 204. The session's summary: 173 questions allowed, none denied, one unaskable
  (the empty swap queue), no evaluation error and no finding.
- [Evidence](staging-enforcement-shadow-evidence-2026-10-08.json).
