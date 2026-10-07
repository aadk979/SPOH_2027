# Organisation-wide settings move to platform admins — 7 October 2026

`dashboardPollSeconds`, `alertPollSeconds`, `refreshSessionDays` and
`idempotencyRetentionDays` are platform scope: every event of an organisation
runs with them. The legacy screen let any event's Chief or Admin change them.

**Owner decision D-17:** only the organisation's platform admins
(`OrganisationMembership` role `PLATFORM_ADMIN`) change them, the same authority
that reopens and archives events. Event Chiefs and Admins read them. Lost-person
retention and visitor data stay with event Chiefs and Admins until P11 enforces
`Settings.ManagePrivacy`.

## Release A — editor (`3e946b5`)

- `GET`/`PATCH /admin/organisation-settings` (and the `/events/:eventId` form)
  resolve the caller's event to its organisation under the event lock, then read
  the current organisation role under a share lock, never a token claim.
- A change is one key at the version read, through the existing scoped writer:
  platform-scope row, history, audit and cache notification. Both routes are
  `no-store` before authentication.
- The event settings screen gains an "Organisation settings" section, read-only
  for anyone who is not a platform admin.
- The legacy PATCH refuses the four keys, naming the new endpoint. Only
  `eventName` is still written there, so legacy-form tests that edited a number
  now edit the event name or check the pointers.

## Release B — copy and readers (`8f1c9d6`)

- Migration `20261007130000_copy_organisation_settings` copies the four legacy
  rows to the platform scope of `evt_spoh2027`'s organisation, the only
  organisation those global rows ever governed, with the earlier copies' rules.
- Devices get the poll intervals from their event's organisation, in the same
  snapshot as the capture keys.
- New and rotated refresh sessions take the session lifetime of the home event's
  organisation, as the access-token lifetime already did.
- The replay prune expires each organisation's records by its own policy. Records
  written outside any event keep the registry default (7 days); no organisation's
  policy reaches another's records. The prune audit stays count-only.

## Verification

- Locally:
  - New: seven endpoint integration cases (read authority, platform-admin change
    with history and audit, Chief and event Admin refused, demoted admin refused,
    bounds and stale version, another organisation untouched, invalid stored
    value), six migration-harness cases, a session-lifetime case on sign-in and
    rotation, two prune cases, three client cases and one E2E journey.
  - Affected suites: admin, isolation inventory, auth, scheduled prune, device
    settings and the earlier copies; full client, server unit and shared suites;
    types, lint, architecture and hardcoding.
  - Browser specs: organisation settings, settings, device settings, capture,
    events, accessibility and admin.
  - All 100 visual checks on a fresh static export after reviewing the two
    `admin-settings` baselines. One check repeated three times hit the visual
    account primer's sign-in limit, not a screenshot difference; a fresh API ran
    the full suite clean.
- CI: full CI passed for both releases.
- Staging, task 144: the legacy PATCH was refused naming the new endpoint, an
  out-of-range value was refused, nothing changed, and the form was editable for
  the smoke identity, which is a platform admin. No setting was changed.
- Staging, task 145: the migration applied (nothing to copy). After a normal
  sign-in the device's poll intervals matched the organisation's, and the
  refresh cookie lasted 30.00 days, the organisation's session lifetime. The
  first acceptance run looked for that cookie at the wrong path; the second's
  access-log check stopped waiting before the device's 200 line arrived, which a
  later query found. Both were harness timing and scope issues.
- [Evidence](staging-organisation-settings-evidence-2026-10-07.json).

## Found along the way

The legacy screen's "Event name" field writes `AppSetting.eventName`, which
nothing else reads: the app shows `Event.name`. It is the last legacy key.

## Remaining

- Make the event name field edit `Event.name` (or remove it), then drop
  `AppSetting`, its cache and the legacy endpoint.
