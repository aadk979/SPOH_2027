# P10.7 — After-commit announcement device delivery

The API scheduler composition now drains up to five frozen device intents after its
transactional actions. The existing scheduler loop owns the timer and prevents overlapping
ticks. A short SKIP LOCKED claim stores a five-minute lease, bounded attempt count and version;
SENT, SKIPPED and DEAD rows are never revived. Claims contain no body or push credentials.

Preflight takes Event SHARE before the device-intent row, samples the injected clock after
waiting, and rechecks lifecycle, original source/deadline, current active membership, exact
role/station/day intersection and device ownership. Inactive and out-of-scope recipients
have distinct bounded codes; the additive 30th migration adds only that enum value. Foreign
claim scope, expired leases/lifetimes, archived events, unsubscribed/reassigned devices and
exhausted attempts make no external call. Recipient/device eligibility is the last database
snapshot; a subsequent change cannot recall an external request already in flight.

A short send reservation advances the version before releasing preflight locks. Duplicate
executors of one claim token cannot both send. The body preview, event inbox URL and fresh
device keys exist only in memory. The network port reuses the existing five-second Web Push
timeout; its TTL shrinks from the original plan deadline, rather than resetting on retry.
Expiry is checked again immediately before sending. No network call holds a database transaction.

A separate short, version/worker/attempt/lease-fenced transaction records the result.
SENT means **push-service acceptance**, with no claim of device receipt or user reading.
Unconfigured push is a supported SKIPPED outcome and leaves polling as the inbox guarantee.
Gone-device and transient-provider failures use fixed codes; backoff cannot schedule beyond
the original deadline, and final failures/exhausted crashes are dead-lettered. Raw exceptions,
provider bodies, endpoints and keys are neither stored in outcomes nor passed to worker logs.

After a current GONE outcome commits, a separate parent-device-first transaction prunes only
the unchanged owner/endpoint/keys snapshot. Reassignment or key rotation during the request
preserves the new subscription. This ordering avoids an intent/device FK-nullification lock
inversion with unsubscribe. Device dedup identity remains after the live FK becomes null.

The crash window remains explicit: acceptance followed by failed outcome persistence leaves
RUNNING until reclaim. A later attempt can send again with the same collapse tag. External
delivery is therefore **at least once**, not exactly once. Database reservation/outcome faults
retain or roll back the lease/version appropriately; fixed worker logs identify failures.

## Verification, 3 October 2026

- **141 focused database checks in five files** pass, including **36 new worker cases** and
  the private draft/publication/storage/communications suites. They cover current audience/
  device scope, lease/due/expiry boundaries, disjoint bounded claims, SKIP LOCKED, duplicate
  executors, shrinking TTL/backoff/final attempts, exception redaction, unsubscribe/pruning,
  stale outcomes, reservation rollback and the acceptance/persistence crash window.
- Real Event-lock waits observe archive, deactivation, expiry and exhausted leases. A current
  timezone/day-boundary change excludes old postings. A send port successfully updates Event
  and the intent while running, proving that preflight locks ended before external I/O.
- Actual API worker composition both drains existing intents without scheduled actions and
  publishes a saved version then drains its new intents in the same tick. Unconfigured push
  makes zero low-level network calls. These are local database/port tests, not cloud delivery.
- **562 server units**, including six bounded network-gateway cases, and **59 shared checks**
  pass. Workspace types, shared/server builds, lint, architecture (**931 modules / 4,036
  dependencies**), hardcoding, generated settings and current source/fixture scans pass.
  Architecture initially caught time-policy imports in data; clock/day policy now stays in
  application, with only data queries, supplied instants and callbacks in the repositories.
- Full integration passed **1,194 checks / four existing skips in 88 files** (373.40 seconds),
  including all 36 new worker cases. Changed formatting/diff and source/gateway/fixture/unit/
  full committed-history secret scans pass. No worker deployment or actual external delivery
  is claimed by these local checks.

Local migrations/data use guarded `spoh2027_test` only. The real local database, sibling
`V1`, pricing artifacts, client/visual baselines, operational limits and production resources
are unchanged. The full suite uses a temporary awake hold restored in `finally`.

P10.7 remains **in progress**. Legitimate schedule creation/CRUD/UI, reminders, retention and
other catalogue consumers/declarations remain; P10.9 still needs an actual staging schedule.
