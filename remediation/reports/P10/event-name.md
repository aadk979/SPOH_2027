# The event's name, and the end of the legacy settings store — 7 October 2026

The settings screen's "Event name" field wrote `AppSetting.eventName`, which
nothing read: every screen, report and export shows `Event.name`, and nothing
could change that after an event was created or cloned. It was the last key in
the legacy global store.

**Owner decision D-18:** the field renames the event itself, by the event's Chief
and Admin (`config.manage`), like its other settings. Then the legacy store goes.

## Release A — rename (`021f794`)

- `PATCH /admin/event-name` takes the new name (2–120 characters once trimmed,
  the clone rule, now the shared `EventName`) and the name the caller read.
- Under the event's row lock it rechecks the caller's current membership, never
  the token. It refuses an archived event (`SETTING_LOCKED`) and a rename from a
  stale read (409 `CONFLICT`, naming the current name). Repeating a rename that
  already happened changes nothing and audits nothing. A rename is audited as
  `event.rename` with the name before and after. The route is `no-store` before
  authentication.
- The field keeps an edited draft across refreshes and sends the name it was read
  as; after a rename it refreshes `/me` and the event list, so every screen shows
  the new name.
- The legacy `PATCH /admin/settings` refuses `eventName`, naming the new
  endpoint, so it writes no key at all. The screen no longer reads or saves the
  legacy settings: the "Save settings" card is gone, and the former thresholds
  remained only as pointers to where each is changed now.

## Release B — the legacy store goes (`58906e5`)

- Migration `20261007170000_drop_app_setting` drops `AppSetting`, as ADR-003's
  migration plan says: in the same phase, after a release reads only the new
  tables. It fails, leaving the table and its rows, if the table holds a key no
  copy migration accounted for. `eventName` is not copied: `Event.name` is the
  event's name and the app never showed the legacy one.
- Removed with it: `GET`/`PATCH /admin/settings`, the in-memory settings cache,
  its boot load and refresh jobs, the `settings.update` audit action, the shared
  `RuntimeSettings`, `UpdateSettingsRequest` and `SettingsResponse` contracts and
  the registry's `eventName` key. The compiled defaults still named as constants
  read the registry.
- The settings screen loses the Thresholds pointer list, which only pointed away
  from the legacy form.
- The copy-migration harnesses recreate the legacy table for each test, because
  those migrations still run on every new database before the drop; a new
  harness covers the drop. Checks that readers ignored a legacy row or the legacy
  cache went with the thing they guarded against. The two-instance settings repro
  (F03-030) now changes an organisation setting on one instance and reads it
  through the other. The F03-021 repro tested the legacy reset and went with it.

## Verification

- Locally (release A):
  - New: eight rename integration cases (Chief and Admin, audit, `/me` and the
    event list, `config.manage` only, demoted Admin, stale read, repeat, bounds and
    unknown fields, archived), twelve client cases for the field and the pointers,
    and one E2E journey on phone and laptop (rename, reload, legacy refusal,
    accessibility, restore).
  - Affected suites, then the full server integration suite (1983 passed, 4
    skipped), server unit, shared and the full client suite on Node 24 (CI's
    version; five `push-sync` cases fail only on Node 25, whose own `localStorage`
    global shadows jsdom's); types, lint, architecture and hardcoding.
  - Browser specs: event name, admin, both schedule controls, device settings,
    lifecycle controls, lost-person retention, the three operational-catalogue
    specs, organisation settings, product-setting history, schedule timeline,
    scoped capture controls, visitor allowlist, accessibility, events and
    navigation.
  - Visual: on a fresh static export only the two `admin-settings` images
    differed. The old baseline showed the legacy "Event" in the name field while
    the header said "SPOH 2027", which was the bug itself. Reviewed, refreshed,
    and all 100 checks passed on a restarted frozen API.
- Locally (release B): server unit, the affected integration suites and then the
  full suite (1965 passed, 4 skipped; the legacy tests went, the drop harness
  came), shared, the full client suite on Node 24, types, lint, architecture,
  hardcoding and the generated-settings check; the same browser specs; and all 100
  visual checks after reviewing the two `admin-settings` images, which now end
  at the organisation settings.
  - `category-schedule-controls` failed twice on the laptop axe check
    (`color-contrast`) and once on the phone "Load more" loop, then the laptop
    case passed alone and all four passed in a full run. The contrast node was not
    captured; see the handoff. A run I started over a running one restarted its
    API mid-test and left `SEC_4` hidden until its schedule restored it; the run
    after that failed on the missing category and is void.
- CI: full CI passed for both releases, each followed by the staging deploy.
- Staging, task 146: the legacy PATCH was refused naming `/admin/event-name`; an
  invalid name was refused `no-store`; a rename from a stale read was refused 409
  naming the current name; the same name was a no-op; the name and legacy values
  were unchanged; the form showed the event's name, editable for the smoke
  identity, with no "Save settings". Staging stored no legacy `eventName`. The
  event was not renamed on staging.
- Staging, task 147: the migrate task's stream shows the drop; the legacy GET and
  PATCH answer 404; the device's settings read; the event's name was unchanged
  and shown in the field; the Thresholds section was gone.
- [Evidence](staging-event-name-evidence-2026-10-07.json).
