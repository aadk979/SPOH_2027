# Foundation batch — 11 October 2026

Closes the build gaps the [10 October night batch](BATCH-2026-10-10-NIGHT.md) left in P08, P10
and P12, so those phases can close under ADR-011. No AWS resource was created; nothing deployed.

## Built

| Step  | What                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P10.7 | `fallback.remind`: declaring a window queues a system reminder after the new event setting `fallback.reminderMinutes` (default 30); while the window is open it pushes to the declarer and coordinators and queues the next one, and a closed window ends the chain. `event.archiveReminder` now has a handler: after the late-sync grace it tells the organisation's active platform admins, and stays silent if the event moved on. The authorization and AVP summaries are local ticks in `app/jobs.ts`; no `setInterval` remains outside `platform/scheduler`. |
| P08.8 | Audit shipping (also P15.7's audit copy): the recurring system action `audit.ship` copies committed audit rows, in `(createdAt, id)` order and two minutes settled, to `AUDIT_LOG_GROUP` through an `AuditShipment` cursor in the same transaction. A failed delivery leaves the cursor; delivery is at least once with the row id for deduplication. CDK passes `/spoh/<stage>/audit` to the task and grants only `logs:CreateLogStream` and `logs:PutLogEvents` on its streams. |
| P08.9 | `.github/workflows/browser.yml`: the Playwright journeys or visual suite against a seeded disposable `_test` database, the API serving the static export on port 4012. Dispatch-only until P16.1 reconciles the specs that expect other ports or databases. |
| P10.8 | Producers for the kinds without an editor: `POST /schedules/lifecycle` (the edge's own Cedar action plus `Schedule.Manage`, reviewed against the lifecycle version) and `POST /schedules/reports` (`Report.Generate`, a day of this event), and `POST /schedules/:id/cancel` for those kinds at the row's version. The Schedule screen has both forms on the event clock and a cancel button on pending rows. A small `features/eventDays` read supplies the days. |
| P12.1 | Each stage owns its Cognito pool (`infra/cdk/src/identity.ts`): managed login version 2 with a Cognito-provided branding style bound to the app client; production's pool is retained and deletion-protected; `-c cognitoPlan=plus` switches production to Plus with threat protection for the event month. The dead reference to the pool deleted on 10 October is gone (D-24, assumed). |

## Decisions and follow-ups

- **D-24 (assumed):** production's stack owns its pool. Re-provisioning a restored database into
  it (rebinding `cognitoSub` by email) is added to P15.8 as build work.
- `prisma migrate diff` against the migrated test database showed the 10 October content foreign
  keys declared `ON UPDATE NO ACTION` in SQL but cascade in the schema. The schema now says
  `onUpdate: NoAction` (event ids never change), and the diff is empty.
- Staging, delivery and browser execution for everything above is listed in P16.8.

## Verification

The inherited 04:52 UTC local run is not acceptance evidence: its saved logs end
during server coverage, its session and processes are gone, and no final exit
code was retained. The architecture cycle is confirmed in that log. A focused
coverage reproduction confirmed the impossible 100-station print fixture timed
out at the unchanged five-second limit. The grouped repair moves the shared
print type to a pure domain leaf and rejects physically impossible grids before
font shaping; the dense 30-station layout remains covered.

The corrected complete local run is recorded below; the exact pushed-head GitHub
result remains required before tracker closure. No P14/P15 application work belongs
to this batch.

The durable complete run started at 05:40 UTC on 11 October and retained actual
exit **1**. Every step except server coverage passed. Server coverage had 3,013
passing tests, two existing skips and one failure: the source-derived client route
inventory missed the real `GET /incidents` caller when its optional request
options were conditional. Client coverage passed all 971 tests; shared passed
278, policies 85 and CDK 104. Lines/branches were server 96.84/87.87%, client
80.78/73.12% and shared 93.36/82.19%. All floors, dependency audit and both secret
scans passed. This failed run is diagnostic evidence, not the final build gate.

The grouped inventory repair resolves default methods separately for conditional
branches, honors object-spread override order and keeps unresolved methods
unknown. Independent synthetic-source regressions reproduced both misses before
the repair. Incident list reads now always request `no-store`, including callers
without an abort signal. Seven focused scanner/real-route assertions and eight
affected client assertions pass; server/client typechecks and changed-file lint
pass. The corrected complete local gate follows.

The full Node 24.19.0 runner started at **06:18:28 UTC on 11 October 2026** and
retained actual exit **0** at 06:48 UTC. Every CI step ran without skip/resume
arguments: source/build/architecture guards, test-only migrations, shared (278),
policy (85), CDK (104), server (3,018 passed, two existing skips; 239 files) and
client (971 passed; 98 files). Lines/branches: server **96.84/87.87%**, client
**80.78/73.11%**, shared **93.36/82.19%**. All unchanged coverage floors passed;
dependency audit found no unexcepted blocking advisory, and both history and
staged-batch secret scans found no leaks. The documented CDK bundled advisory
exception remains until 31 October; this is not a zero-advisory claim.

An independent read-only review found no concrete defect in the grouped private
reader, download ownership, print lock/history, physical bound or scanner repairs.
This review supplements the gate. D-11 authorizes the application commit and one
push to main; exact-head application GitHub CI is pending. Closure evidence will
be carried into the next P14 batch, with staging/browser acceptance in P16.
