# P11.5 release 2a — D-21 and the screens (9 October 2026)

**Status: on staging, task revision 153 (`1375a37`).** The old guards still decide
every request; nothing anyone may do has changed. The transaction-timeout question below
is answered (D-22) and fixed; release 2b waits for the soak in
[enforcement-timeouts.md](enforcement-timeouts.md).

## What shipped

- **D-21** (`376d1c2`): `Settings.Read` for configuration reads, C14–C16, and test
  fixtures that record who captured what. Its first CI run stopped at the tracker
  check and the docs-only fix (`45930ab`) ran no tests, so the shared contract
  test, which still counted 65 actions, first failed on `f227354`. `1375a37` counts
  66 actions, 47 of them editable.
- **Screens** (`f227354`): `GET /me/permissions` answers from the local engine which
  event-wide actions the caller may take and whether they may change operational,
  security and privacy settings. Visitor data, lost-person retention, the attendance
  root and trusted networks are disabled for anyone who is not a platform admin, with
  a line saying so (C9). The server still decides every request.

## Verification

- Server: 2782 passed, 4 existing skips. Client: 646 passed. Shared: 251 passed.
  Policy package and CDK pass. Types, lint, architecture, hardcoding, actions and
  settings checks pass.
- Browser: 33 of 34 specs pass. Specs that change security or privacy settings
  promote their actor to platform admin for the test and restore the role; the
  Chief's settings checks expect the locked editors.
- `capture-schedule-controls` fails in `allPages` as it did on 6 October, before
  this work: the schedules list polls every 3 s, which re-renders "Load more" and
  restarts paging, so the click never finds a stable button. 2a does not touch that
  list or its queries. Fixed since: see [enforcement-timeouts.md](enforcement-timeouts.md).
- Visual: the visual database took its nine pending migrations. 98 of 100 matched;
  the two `/admin/settings` differences are the new line and the disabled fields,
  reviewed at both widths and re-recorded. The full run then passed 100 of 100.

## Staging

- CI 37905215431 and deployment 37906461404 passed, task revision 153 (digest
  `sha256:381011fd2122a4dfe62b59ee419484e0c2af2cd9d70445d01266ab4b053303d6`).
- The smoke identity's role, 26 capabilities and probe statuses are identical to
  the shadow release. `GET /me/permissions` answers 200 with every settings class
  allowed: the smoke identity is a platform admin. The D-21 migration was applied.
- The session's summary: 173 allowed, none denied, one unaskable, **two failed**, no
  unexplained finding. Both failures are Prisma's "Unable to start a transaction in
  the given time", on `GET /lost-person/active` and `GET /registrations/categories`, at
  the same instant (08:51:30Z) while the signed-in screens polled. None in the
  preceding six hours. [Evidence](staging-enforcement-screens-evidence-2026-10-09.json).

## Question before release 2b

Every enforcement point opens an interactive transaction for the policies' reads
(ADR-005 §1), alongside the request's own queries, against a 25-connection pool on
a `db.t4g.micro`. In shadow a timeout is only a log line; enforced, it fails closed,
and the request is refused. Options: (a) read the entities without an interactive
transaction, or with a longer wait; (b) enforce as planned and watch for these
errors; (c) load-test the polled screens on staging first. Recommendation: (a), then
a staging soak with no shadow errors before 2b.
