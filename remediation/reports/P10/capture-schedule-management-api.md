# Reviewed capture schedule list, edit and cancel — partial P10.8

The private capture schedule collection lists only one-off, creation-audit-backed
capture.open actions for the exact event or owned station target. Current
config.manage authority is checked under Event/member/station locks. Pages use
createdAt/id keysets; cursor ownership excludes the mutable status filter. A
single audit query supplies page provenance. Malformed/unsupported rows are
omitted without changing storage; the raw page cursor still advances. Responses
contain bounded capture intent/status and current-person attribution, excluding
actor identities, raw payloads, dedupe/lease fields and unbounded worker errors.

A creator can edit their pending schedule's boolean, current selected setting
version, future instant and required reason. Target/key and creator remain fixed,
so the existing worker continues checking the original creator's current
authority. Editing advances runAt and scheduledFor together and increments the
schedule version. A current event configuration manager can cancel another
creator's pending capture schedule; cancellation cannot execute its effect.
It increments the schedule version, records completion and clears lease fields.
Neither operation changes a setting or appends setting history immediately.

Both writes require a reviewed positive schedule version and UUID, and lock
Event UPDATE, exact current membership SHARE, owned station SHARE, action UPDATE
and reservation UPDATE in that order. Status/version are read after the action
wait; the clock is sampled after all waits. A due worker claim can win before the
action lock, and then the pending mutation refuses. An editor holding that lock
prevents a due claim until its replacement future definition commits. The worker
retains its own current setting-version, authority and lifecycle checks.

Mutation, operational actor audit and identifier/version-only receipt share one
ReadCommitted transaction. Immutable per-version update/cancel audit binds the
original normalised request, actor, operation, action and reviewed version.
Successful retries hold current read authority and return current status and
fresh resolved settings, including after later edits, execution, cancellation
or archive. Changed intent, route id, actor or operation cannot reuse a receipt.
Archive refuses fresh writes; lost current authority refuses reads and retries.

## Local verification on 5 October 2026

The initial shared test refuses the absent contract module; after implementation
all 173 shared checks pass, including 27 new management cases. The initial HTTP
test fails 404 for the missing list route and passes after implementation.
The first expanded HTTP run has three invalid membership fixtures; corrected
fixtures pass all 37 cases. All 55 expanded cases then pass, including real
PostgreSQL lock waits. A subsequent combined run finds a leaked fake-clock
offset in an exact timestamp assertion; each new case now resets its fixed clock.
These failed setup/fixture runs are excluded.

The final focused regression passes 299 checks across eight files in 82.29
seconds, including all 63 new management cases, related operational settings,
producer, capture admission, timeline and route isolation. The new suite resets
its clock in every case; the earlier combined failed run is excluded. Nineteen
real PostgreSQL wait cases cover Event, exact membership, station, action and
reservation checks, both editor/claim race directions and fresh list/replay
values after a wait.

The fresh full backend regression passes 1,714 checks with four existing skips
across 104 files in 516.44 seconds. Its machine-readable report confirms all 63
new management cases pass. Workspace types, lint, architecture (1,082 modules,
4,875 dependencies), settings/hardcoding and 587 server units pass. Maintained
formatting passes after correcting the new handler's style; no new exemption is
added. Source/test and 646-commit history secret scans pass. All three preserved
P08 fingerprints and historical P05 pricing remain unchanged. Shared/server
builds and the 32-page static export pass; the compiled export passes actual
phone/laptop startup/reload under CSP and malformed runtime configuration still
refuses startup. Normal preview is rebuilt/restored on Node 24.

CI [37298082070](https://github.com/aadk979/SPOH_2027/actions/runs/37298082070)
and staging deployment
[37298820871](https://github.com/aadk979/SPOH_2027/actions/runs/37298820871)
both succeed for release aa42013d6f7f255114cec8992219edcb03066542.
At 19:08 SGT, read-only AWS gates confirm that CloudFormation is UPDATE_COMPLETE
and the sole running ECS task uses that exact image and task revision 125.
Normal Cognito sign-in in installed Chrome then verifies private event listing,
one reviewed edit, UUID replay, altered/stale/anonymous refusals, reviewed
cancellation and current-state replay of earlier successful requests. The
single owned schedule is CANCELLED at version three with zero worker attempts.
Original capture inheritance, compatibility/product settings and READY lifecycle
remain unchanged. Settled hard reload, capture display and normal sign-out pass
with zero application errors or CSP violations. See the
[sanitised evidence](staging-capture-schedule-management-api-evidence-2026-10-05.json).

Two earlier probe attempts stop before any schedule intent is saved or sent:
the harness incorrectly requires no-store on legacy runtime/product reads.
A read-only diagnostic confirms all scoped values are unchanged; each failed
attempt revokes only its own current session with HTTP 204. The corrected probe
requires no-store on the private catalogue/schedule boundary and passes.
These harness failures are excluded from successful consumer evidence.

No client source, layout, schema or worker behaviour changes in this slice;
existing client/visual evidence is reusable. No real local database is reset or
migrated. Existing capture producer staging fixtures are already restored and
are not recreated for these management checks.

## Remaining scope

Reviewed capture scheduling UI and broader generated catalogue consumers remain
open. This API does not close P10.7, P10.8, P10.9 or their gate. The separately
recorded intermittent immediate reload failure remains unresolved session work;
it is not counted as a complete consumer pass. Production/cutover remains owner
controlled, and no budget or programme closure is claimed.
