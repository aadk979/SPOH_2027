# SPOH handoff — 6 October 2026 (evening)

Continues [the milestone handoff](HANDOFF-2026-10-06-MILESTONES.md) under
[ADR-010](../../docs/adr/ADR-010-delivery-process.md). Work only in
`C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`, setting every command's
working directory; leave sibling `V1` unchanged. Verify Git and cloud facts
before acting. These are observations, not permanent claims.

## Accepted this session

| Milestone                         | Source                 | Staging                           | Report                                                |
| --------------------------------- | ---------------------- | --------------------------------- | ----------------------------------------------------- |
| Category scheduling               | `ab9a67d` + `7ed246b`  | accepted on `7ed246b`, task 137   | [P10 category](P10/category-schedule-controls.md)     |
| P13.6 local readiness wiring      | `7ed246b`              | strict 11-item readback, task 137 | [P13 readiness](P13/readiness-prerequisites.md)       |
| Gateway keep-alive 503 fix        | `7ed246b`              | probe 3 → 0 503s in 1,200 reads   | [P08 keep-alive](P08/gateway-keepalive.md)            |
| P11.3 policy suite under 10 s     | CI of `ab9a67d`        | not applicable                    | [P11 policy](P11/policy-prerequisites.md)             |
| Thresholds: compatibility release | `86d2ec4`              | refusal-only acceptance, task 138 | [P10 thresholds](P10/threshold-settings-migration.md) |
| Thresholds: copy and readers      | `92ad10c` as `a81f36b` | read-only acceptance, task 139    | same                                                  |
| sharp / shell-quote audit repair  | `a81f36b`              | included in task 139              | same                                                  |

**Staging now runs `a81f36b`** on task revision 139 (digest
`sha256:86a69bd91a572d0736625476a17343faeea1cafce3ac621953b587a2f9a0c68b`).
Later docs commits do not redeploy.

## Open owner decisions

- **P08 monitoring and budget.** The prepared native monitoring and dashboard
  draft (`.local/prepared-p08-monitoring-20261006`, 116 definition tests) is
  ready. Its cost amendment
  (`.local/prepared-p08-cost-amendment-20261006`) projects January at about
  $130.76 against the approximately $130 ceiling, even with zero staging hours.
  Do not deploy it or amend the budget without the owner's decision.
- D-15 visitor eligibility; the 28 October production go decision; real Cognito
  pool, scaling, notification endpoints. All unchanged.

## Next candidate milestones (no owner input needed)

1. **Remaining legacy settings.** The other ten `AppSetting` keys, using the same
   ordered pattern: retire or bridge the legacy writer first, then copy with
   `MIGRATION` history and switch readers, then the client `runtimeSettings` and
   session readers, then drop the table. See the migration header's disposition
   table and `.local/p10-legacy-readers-plan-20261006.md`.
2. **Gateway observability (P08.8).** Add `$context.integrationErrorMessage`,
   status and latency to the API access-log format, so any recurring gateway 503
   explains itself. Keep watching for 503s in `Spoh-staging-Platform-ApiAccessLogs*`.
3. **P13.6 remainder.** The six external domains (content, role permissions,
   notifications, staging smoke, backups, alarms) need real evidence sources.
   Until then they stay unavailable and first LIVE stays blocked.
4. P11.4+ adapters only after real grant, identity and lifecycle contracts exist.

## Practical notes

- `remediation/tools/progress.mjs` flag parsing makes `--force` consume the next
  argument. Write `start <step> --note "…" --force` (note first). ADR-010's own
  example uses the other order and silently drops the note; fixing `parseFlags`
  is a small open tooling task.
- Browser specs on 3001/4012 share the API's in-memory rate limits (unchanged by
  design). Run one spec per process and restart the 4012 API between specs;
  `.local/rerun-spec-fresh-api-20261006.ps1 -Spec <name>` does this, stopping
  only a verified `server/dist/index.js` listener. Interrupted catalogue specs can
  leave overrides; reset them through the public API
  (`.local/e2e-reset-leftover-overrides-20261006.mjs`), never by raw SQL.
- The lifecycle E2E specs require the disposable API on 4012; the category specs
  require the same-origin static runtime on 4014.
- The E2E database now has the threshold copy migration. The frozen visual
  database was deliberately not migrated: it has no legacy rows for those keys.
- Category staging harness:
  - It waits for CSS transitions before axe and reports gateway or backend
    failures as `BACKEND_FAILURE_<status>:<apigw-requestid>`.
  - `reviewed-retryN` requires the previous ledger to be settled and verified.
  - `.local/verify-category-attempt-baselines-20261006.mjs` re-verifies a failed
    attempt's baselines read-only.
- Read-only staging probes and readbacks: `.local/gateway-503-probe-20261006.mjs`,
  `.local/readiness-readback-20261006.mjs`, `.local/release-a-acceptance-20261006.mjs`,
  `.local/release-b-acceptance-20261006.mjs`.
- Dependency advisories can appear between pushes. A failing audit on an
  unchanged lockfile means a new advisory. Repair within existing ranges
  (lockfile only) and never add an exception without approval.

Safeguards are unchanged: never reset, seed or migrate real local `spoh2027`;
keep DB and browser suites serial; never lower coverage floors or waive
failures; production creation and cutover wait for the 28 October go decision.
