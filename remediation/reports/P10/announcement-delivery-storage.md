# P10.7 — Durable announcement delivery storage

The supplied-transaction enqueue core freezes one delivery plan per published URGENT
announcement and one pending record per eligible subscribed device. This is storage only:
there is no producer, publishing handler, network delivery worker or new HTTP endpoint.
Existing immediate sending keeps its behavior. The future publishing use case must own
current author authority and pass its transaction; this core opens no nested transaction.

The shared audience predicate preserves the existing exact role/station/day intersection
and active event membership. Event UPDATE precedes source lookup and audience selection;
the clock is sampled after waiting. The event's current timezone and day boundary determine
today's roster. Foreign/missing sources and ARCHIVED writes are refused. Audit context must
name the same event. INFO makes no plan, device record or new audit receipt.

URGENT creates an immutable plan even when there are no subscribed devices. Repeating or
concurrently enqueueing the same source returns the first plan without adding recipients or
devices that joined later. The deadline is the earlier of explicit message expiry and the
existing 30-minute push lifetime measured from original publication. A late attempt cannot
extend it; an expired first enqueue is refused at the inclusive deadline.

Plans, device records and a metadata/count-only attributed audit share the caller's commit.
No message body, push endpoint or credential is copied. Device records reference the current
subscription and keep its opaque identity separately for deduplication. Unsubscribe may null
the live FK while retaining that identity; it cannot assign another subscription to an old
intent. Delivery states and fixed error codes have shared/Prisma enum parity, and the two
event-owned models are in the generated scope guard.

The additive 28th migration creates the two tables, enums, scoped FKs/indexes, state/attempt
bounds and immutability triggers. Plan contents and recipient/dedup identity cannot change.
An announcement with a plan cannot change text, targeting or deadline underneath delivery;
unplanned existing announcements retain their prior behavior. Source deletion cascades its
technical plan/records, while membership/person/event FKs restrict dangling provenance.
No existing row is rewritten or dropped.

## Verification, 3 October 2026

- **67 focused database checks in three files** pass: 22 new storage cases plus existing
  communications and private draft behavior. They cover exact targeting, foreign sources/
  memberships/plans, device reassignment before enqueue, zero-recipient/device plans,
  concurrent/repeated enqueue, unsubscribe, database immutability/state/error bounds,
  audit failure, newly published source rollback and a real scheduled audit reference.
- Event-lock wait cases observe archive, deactivation and inclusive expiry. The additional
  boundary test changes timezone/day boundary while locked and advances the clock across
  the boundary: the queued devices belong only to the current event day.
- **555 server units**, including five original-lifetime/expiry cases, and **47 shared
  checks** pass. The first type check caught raw fixture transactions passed to a guarded
  application transaction type; application calls now use guarded `prisma.$transaction`.
  Schema tests caught missing shared enum mirrors and two metadata classifications, fixed
  without weakening their checks. The complete focused rerun passed after these repairs.
- All workspace types, root lint, architecture (**916 modules / 3,962 dependencies**),
  hardcoding, generated settings, shared/server builds, changed formatting/diff and current
  source/fixture secret scans pass. Full integration passed **1,120 checks / four existing
  skips in 86 files** (394.31 seconds), including all 22 new storage cases.

All local schema/data work used guarded `spoh2027_test` on localhost:5435. The real local
`spoh2027` was not reset, seeded or migrated. Full verification uses a temporary system-awake
hold restored in `finally`. No client layout, visual baseline, operational limits or infra
definition changed; no new browser/visual or actual external delivery result is claimed.

The preceding draft checkpoint `040babc32990453bc0b734651cdf5e5e38d0c730` has successful
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37117761446) and
[staging deployment](https://github.com/aadk979/SPOH_2027/actions/runs/37117985791), with
a matching `UPDATE_COMPLETE` stack. This newer storage source still requires its own
verified commit/push and pipeline result; the earlier private draft Chrome proof does not
prove delivery storage or external push.

P10.7 stays **in progress**. Timed publication/attribution and a bounded, fenced after-commit
delivery worker remain required. A push-service acceptance is not device receipt, and a
crash between acceptance and persisting the outcome leaves an unavoidable retry window.
Exactly-once external delivery must not be claimed. Polling remains the inbox guarantee.
Schedule CRUD/UI, reminders, retention integration and other catalogue dependencies remain.
