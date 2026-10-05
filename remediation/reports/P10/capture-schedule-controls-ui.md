# Reviewed capture scheduling controls — partial P10.8

The generated capture.open controls now offer private event and station schedule
lists, reviewed future creation, creator-owned pending edits and current-manager
pending cancellation. The schedule feature owns its typed API, query keys and
forms; settings consumes its public controls. This slice changes no backend,
shared contract, schema or worker behaviour.

The collection shows bounded status, attempts, reason, event-clock execution and
current-person attribution. Status filters and raw-page cursors remain private to
the event, person and exact target. Creation requires reviewing all statuses and
remaining pages, including empty pages whose unsupported raw rows were omitted.
The interface explains that earlier capture changes can invalidate a later
action's independently reviewed setting version.

Create and edit capture a selected setting version separately from the schedule
version. A required reason and deliberate confirmation accompany shared-schema
validation. Date/time entry uses the current event's IANA timezone, with an
explicit normalised execution preview and existing repeated/skipped-time rules.
Missing authority, identity or clock blocks scheduling. Archive blocks fresh
writes. Changed setting inheritance, schedule version/status or event timezone
requires a new review and clears confirmation. Cancellation does not change a
setting and does not unnecessarily require an unchanged capture version.

An ambiguous response freezes the request and UUID in memory, disables scope,
collapse, fields and navigation within the review, and retries the same intent.
The confirmation displays the server's latest returned definition/status even
when a prior receipt is replayed after editing, cancellation or execution.
Fresh denial clears private scoped/schedule queries and hides their values. The
denied flag lives above the current-value query so cache removal cannot remount
the review and lose it. Successful writes refresh the current owner's scoped
and schedule queries without invalidating every event query.

## Local verification on 5 October 2026

Forty-five new client checks cover the strict API boundary, response ownership,
empty-page progress, event/DST clocks, independent reviewed versions, latest
receipt definitions, stale review, ambiguous intent, lock/freeze behaviour,
current capability and event/person changes, archive, denial and cache privacy.
The final focused run passes 79 checks including existing immediate capture
controls. The full client suite passes 505 checks across 59 files in 14.41 seconds.

Initial API checks fail before implementation. Early UI failures include harness
timing and invalid mock fields; expanded denial checks also reveal the real
query-remount privacy defect fixed above. Those failed runs are excluded. Types,
lint and architecture pass after splitting the forms/hooks and avoiding type
cycles; no exemption or limit is relaxed. Architecture checks 1,099 modules and
4,960 dependencies. Settings generation and hardcoding checks pass.

Six new serial browser journeys run only against
spoh2027_rehearsal_shift_e2e_test. Phone and laptop event/station management each
commit a future request while deliberately losing its response, retry one UUID,
edit to version two, cancel at version three, and retain the cancelled row after
hard reload without changing capture. Two UI producers run the real worker at
event/station scope, observe SUCCEEDED and one SCHEDULE history row, refuse
registration while paused, and restore only their owned effect with a reviewed
public RESET. Accessibility checks report no violations in reviewed forms.
Together with four existing capture controls journeys, the final run passes all
10 checks in 2.8 minutes.

Two earlier browser runs are excluded. One has missing raw-page traversal and a
hidden native-radio harness interaction; its two owned pending actions are
reviewed and cancelled with zero attempts. The next passes management but its
independent API fixture token expires during worker polling; the single owned
worker effect is provenance-checked and restored through public RESET. The
fixture API now has its own normally renewed session family rather than sharing
the browser's refresh cookie. Final journeys verify original scoped values and
revoke only their owned fixture sessions. No real local spoh2027 database is
reset, seeded or migrated.

The 32-page static export and actual compiled phone/laptop startup/reload under
CSP pass; malformed runtime configuration still refuses startup. Maintained
formatting and source/test/history secret scans pass. A synthetic high-entropy
test UUID that triggered a scanner false positive is replaced by a plain UUID
sentinel without a scanner exemption. Preserved P08 pricing fingerprints and
historical P05 pricing remain unchanged.

The fresh serial visual suite passes all 70 checks in 2.8 minutes after restarting
the frozen API. Eight new phone/laptop list/create/edit/cancel images are inspected;
only two existing capture-value images gain the schedule button. Manual capture
review and both roster images remain unchanged. Read-only comparison confirms
all nine frozen membership rows and eight person last-seen markers are unchanged.
The initial acceptance run is excluded: expected missing/different images restart
workers, repeating account priming until the frozen credential-minting limiter
returns 429. Targeted acceptance followed by the fresh full run passes without
altering production rate limits or other baselines.

The four schedule states use typed read-only visual rows; real API writes and
worker execution are proven by the separate browser suite.
Existing backend evidence is reusable because backend/shared source is unchanged:
1,714 integration passes with four existing skips, 173 shared checks and 587
server units from the capture management slice.

## Staging acceptance

CI [37309550504](https://github.com/aadk979/SPOH_2027/actions/runs/37309550504)
and deployment
[37310396758](https://github.com/aadk979/SPOH_2027/actions/runs/37310396758)
both succeed for pushed release 769dfc5e556226daf382a31f5d3f4392ffe77ff9
(application source e6718c1). At 20:44 SGT, read-only AWS checks verify
UPDATE_COMPLETE and the sole running task's exact image, definition revision 126
and completed rollout before the browser starts.

Normal Cognito sign-in in installed Chrome then exercises phone event list,
event-clock preview, one future UI request whose committed receipt is deliberately
lost, frozen fields/scope/collapse and an identical UUID/body retry returning the
same action. Reviewed UI edit advances to version two with agreeing execution
instants; cancellation advances to version three with zero worker attempts.
The cancelled row remains visible after settled hard reload. A laptop station
collection is read without writing. All private reads are no-store; event/station
capture, capture history, legacy/products and READY lifecycle remain unchanged.
Normal sign-out returns 204. Application errors, CSP violations and actual
backend failures are zero. The synthetic 503 is only the lost-receipt harness.

The [sanitised evidence](staging-capture-schedule-controls-ui-evidence-2026-10-05.json)
records these checks. One legitimate owned CANCELLED action, its creation/edit/
cancellation audits and identifier-only receipts remain; no setting/history or
other product effect was requested. The successful probe is not rerun. Its
restricted, ignored request inventory remains available for review.

## Remaining scope

Broader generated catalogue consumers, complete schedulable actions and phase
exit criteria remain open. This bounded consumer does not close P10.7, P10.8,
P10.9 or their gate. The separately observed intermittent immediate reload
session symptom remains unresolved; this slice does not claim a fix. Production
creation/cutover and post-event programme closure retain their owner boundaries.
