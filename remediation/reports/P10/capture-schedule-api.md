# Reviewed capture schedule creation and status — partial P10.8

Current event configuration managers can create a future capture.open change at
event or owned-station scope. The endpoint accepts only the verified capture
consumer, a boolean, selected stored version, bounded required reason, future
instant and UUID. Platform, product/privacy/security keys, reset, recurrence,
caller identity/event/source and worker retry policy are unavailable. This is a
bounded producer for the existing setting.apply handler; it adds no generic job
writer, migration or immediate setting effect.

Creation takes the exclusive Event lock, current exact-membership share lock
and owned-station share lock, then the retry reservation, in that order. It samples
the injected clock after those waits, refuses archive, requires a strictly future instant and compares
the selected stored version. A station inheriting an event version still reviews
its own zero version. Its action, attributed operational creation audit and
identifier-only retry receipt share one ReadCommitted transaction. Enqueueing
does not append setting history, write a setting or publish its cache change.

The existing worker again checks the creator's current authority, owned target,
lifecycle and reviewed setting version when due. It commits the guarded setting,
attributed SCHEDULE history, audit, cache notification and scheduler outcome
together. Competing changes, archive and lost authority refuse execution. Future
dependent changes cannot guess the version that an earlier queued action will
produce; they require a review of the current stored version.

The private no-store status endpoint and successful retry hold Event/current
membership before inspecting an exact event/type/action. Only supported one-off,
audit-backed capture actions are exposed. Station ownership is checked again.
The response contains bounded operational intent, schedule status/version,
current-person attribution, event-clock evaluation and freshly resolved values.
It omits actor identities, raw payloads, lease/worker identifiers and raw errors.
Unknown worker errors become EXECUTION_FAILED without modifying storage.

The UUID receipt retains only the scheduled action identifier. Immutable creation
audit binds target, value, reviewed version, reason and normalised instant, so an
altered intent returns 409. A retry returns current status and current values,
including after execution, later edits or event archive. It cannot overwrite a
later pending definition or reuse another creator's receipt. Unknown or malformed
stored payload/audit is unavailable without exposing its JSON.

## Local verification on 5 October 2026

The first HTTP test refuses the absent endpoint; after implementation and shared
contract rebuild it passes. All 58 new database cases and the related operational
mutation/history/restore/read, worker, timeline and route isolation suites pass:
273 checks across eight files in 78.68 seconds. They exercise actual scheduled
event/station pauses and capture admission, inclusive due time, one-action replay,
strict and foreign input, inherited versions, immutable retry intent, archive,
current authority, atomic rollback, malformed storage, concurrent UUIDs and real
Event/member/reservation lock-wait cases. Post-wait reads return fresh status, values
and clock; creation refuses a time that became due while waiting, including on
its retry reservation. Eleven real lock-wait cases cover these paths.

All 146 shared checks, including 22 new contract cases, and 587 server units pass.
Workspace types, lint, generated settings and hardcoding checks pass. Architecture
passes with 1,069 modules and 4,778 dependencies. The expanded suite's initial
helper/recurrence/completion fixture mistakes and rate-limit exhaustion are
excluded; fixtures now use a legitimate bounded test-only admin limit. Application
limits remain unchanged. The earlier unbuilt-contract run is also excluded.

The final full backend regression passes 1,651 checks with four existing skips
across 103 files in 531.62 seconds; its machine-readable output confirms all
58 new cases pass. An earlier 1,650-pass run precedes the final reservation-time
guard and is superseded by this fresh run. Shared/server builds and the 32-page
static export pass. The real compiled export passes phone/laptop startup/reload
under CSP, with malformed runtime configuration still refusing startup. Secret
scans and maintained formatting pass; a synthetic UUID fixture caught by the
generic-key scanner is replaced with a recognisable test UUID, without exclusions.
All three preserved P08 fingerprints and historical P05 pricing are unchanged.
Normal preview is rebuilt/restored; no real local database is reset or migrated.

Exact-image CI/deployment and normal Cognito worker verification are pending.
Existing client/visual evidence is reused because this slice changes no client
source, layout or database schema.

## Remaining scope

Capture schedule list/edit/cancel and reviewed creation UI remain open, as do the
other operational consumers and complete generated settings controls. This API
does not complete P10.7, P10.8, P10.9, the phase or its gate. No production creation,
cutover or broad budget/monitoring compliance is claimed.
