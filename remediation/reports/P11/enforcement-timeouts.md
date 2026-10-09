# P11.5 before release 2b — the shadow evaluation errors (9 October 2026)

**Status: fixed in code; release 2b waits for the D-22 soak.** D-22 = A with C and
D-15 = A, both by the owner's delegation to the written recommendations on 9 October.

## What happened on staging

The two errors in [release 2a](enforcement-screens.md) were not permission mistakes, and
not load. They were a cold start:

- The smoke identity signed in after a quiet spell. The pool had closed its idle
  connections (`idleTimeoutMillis` 30 s, no floor).
- The first screen fired about six API requests at once, beside Next.js page renders, on
  the 0.25 vCPU task. RDS `DatabaseConnections` went from 2 to 22 in that minute, and the
  app's CPU peaked at 45.6 %.
- Every API request in the burst took about 3 s (`/me` 3243 ms). Plain queries wait up
  to 5 s for a connection (`connectionTimeoutMillis`), but the shadow check ran its
  reads in an interactive transaction, and Prisma's default `maxWait` for one is 2 s.
  The shadow check was the only thing on those requests to fail.

The transaction bought nothing: under READ COMMITTED each statement has its own snapshot
anyway. It also held a connection through the Cedar evaluation.

## The change

- **Policy reads are plain queries** (`authorize.ts`). The entity builder reads through
  the root client at an enforcement point, or a use case's own transaction if one passes
  it in.
- **One connection wait for everything.** `transactionOptions.maxWait` is now the pool's
  5 s, so a use case's own transaction is no longer the first thing to fail while
  connections open.
- **A warm pool floor.** `DATABASE_POOL_MIN` (default 5, at most the max) is opened at
  start-up and kept however idle the pool is, so a screen's first burst after a quiet
  spell, or a fresh task after a deploy, does not wait for TLS handshakes to RDS.
- Two route-contract tests counted the root client's `person` and `station` lookups to
  catch N+1 queries. The policies now read the caller's own `Person` through that client,
  so the windows test leaves the caller's lookup out, and both restore their spies in
  `finally` (a failing count used to leak into the next test).

## Verification

- A regression test refuses `$transaction` and asks `/me/permissions`: it fails on
  `e06388d` (every action answered false) and passes now. Configuration tests cover the
  floor and refuse a floor above the max.
- Server: 2784 passed, 4 existing skips. Client: 647 passed (under Node 24, CI's version;
  Node 25's built-in `localStorage` breaks one file locally). Shared, policies, CDK, types,
  lint, architecture, hardcoding, actions, settings, delivery and tracker checks pass.
- [Load evidence](enforcement-timeouts-load-evidence-2026-10-09.json): the production
  image, old (`e06388d`) and new, against Postgres with TLS and SCRAM, a fresh container
  per run, `server/scripts/poll-load-test.mjs` (idle past the pool's timeout, a
  simultaneous first-screen burst, polling at the screens' intervals, a second burst):

  | Run                  | Size           | People | Burst p50 / p95 | Polling p95 | Failures | Shadow errors |
  | -------------------- | -------------- | ------ | --------------- | ----------- | -------- | ------------- |
  | old, staging size    | 0.25 vCPU      | 6      | 4.6 s / 6.8 s   | 371 ms      | 0        | 0             |
  | new, staging size    | 0.25 vCPU      | 6      | 5.9 s / 8.2 s   | 204 ms      | 0        | 0             |
  | old, production size | 0.5 vCPU, 1 GB | 60     | 13.9 s / 20.1 s | 478 ms      | 0        | 0             |
  | new, production size | 0.5 vCPU, 1 GB | 60     | 11.0 s / 18.8 s | 495 ms      | 0        | 0             |

  The old code did not fail locally either: a local database opens connections faster
  than RDS across the VPC, so this does not reproduce staging's 3 s. It shows the change
  costs nothing and fails nowhere. The staging soak below is the check in place.

## Release 2b gate (D-22)

Release 2b enforces once staging, on this change, shows **24 hours with no shadow
evaluation error** in the shadow summaries, including at least one first screen after a
quiet spell (sign in, open the coordinator dashboard and the safety screen). Staging has
little traffic of its own, so the soak counts only with that use in it.

## Capacity: an open risk for the production sizing (P11.9, 28 October)

The bursts are CPU, not connections: about 30–40 ms of CPU per request, and a first
screen is about nine requests. When 60 people load at once (after a deploy, or when a
venue's network comes back), the last answers take about 19 s on the production size.
None failed, and API Gateway allows 30 s, but a full event (about 110 people) at once
would come close to it. Steady polling at that scale is fine (p95 under 0.5 s). Options
for the go decision: a larger task, a second task, or jittering the client's first
fetches. Nothing in release 2b changes this, because shadow already runs every policy
evaluation that enforcement will.

## Also fixed

- **`capture-schedule-controls`** (open since 6 October). "Load more" and "Reload" were
  disabled while `isFetching`, and the 3 s poll re-fetches every loaded page, so the
  buttons spent most of their time disabled. "Load more" now waits only for its own
  page (`isFetchingNextPage`) in the capture schedules, scheduled work, capture history
  and catalogue history lists; asking for a page cancels the poll's refetch instead of
  racing it. The spec's `allPages` waited only for "Reload" and could click a button
  the last page was about to remove; it now waits on the answer to the page it asked
  for.
- **Paged lists no longer rate-limit their own reader.** Each poll of an infinite list
  re-fetched every loaded page, every 3 s (5 s for announcement drafts and schedules).
  Paged far enough, one open screen spent a person's 300 reads a minute, and their
  next action got a 429: the worker cases of `capture-schedule-controls` failed at
  clean-up that way (the browser database holds over a thousand schedules), leaving
  `capture.open` paused for the tests after them. `pagedPoll` stretches the interval by
  the number of loaded pages, so a list costs about one request per interval however
  far it is paged. It applies to all eight polled infinite lists.
- `server/scripts/load-test.mjs` still sent the roster import's removed `block` field;
  it sends `shift`.

## D-15

**A** (recorded in `DECISIONS.md` and `progress.json`): every role may be given an explicit
`VisitorRecord.Read` grant; each read still needs the field's reader role; new events
start with none. This unblocks the visitor part of release 2b and P11.7: the floor is
Volunteer and the default is off, and current field-scoped access stays protected until
that reviewed migration.
