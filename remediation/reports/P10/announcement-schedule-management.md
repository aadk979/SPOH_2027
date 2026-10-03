# Private announcement schedule management — 3 October 2026

This P10.7 continuation adds bounded owned-draft schedule lists, optimistic editing and
cancellation to the verified producer/status APIs. It is a private announcement workflow;
the general event schedule timeline and other catalogue producers/UI remain pending.

Lists use the normal current authenticated capability floor, author/event/draft filters,
`no-store` and stable `createdAt,id` keyset pagination. A cursor must belong to the same
private draft. Status DTOs expose fixed error codes and omit raw payloads and leases.

Mutations lock Event before ScheduledAction, matching execution. They recheck current
membership/capability, exact draft/action ownership, one-off user provenance, PENDING
status and `expectedVersion` after waits. Archived schedules remain readable but refuse
mutation. Worker claims that win the action lock are observed as RUNNING/version changes.

Editing separately requires the current reviewed `expectedDraftVersion`, valid current
target authority, unpublished/nonexpired saved content and a future/pre-expiry time. It
updates `runAt` and `scheduledFor` together and atomically increments version with a
metadata-only USER `schedule.update` audit. Unchanged edits recheck policy but do not
fabricate versions or audit receipts. Attempts are retained; clients cannot reset retry
budgets or inject job type, recurrence, creator or private content.

Cancellation is a POST with current action version and optional bounded reason. Status,
completion timestamp, version and metadata-only USER `schedule.cancel` receipt commit
together. Its clock is sampled after both locks. Cancelling expired content or another
pending action whose draft already published is allowed, but editing that publication is
refused. Cancelled actions cannot be claimed. A stale repeated cancellation returns 409;
the current private read/list reports CANCELLED. The original creation key replays current
edited/cancelled status without making another action.

## Verification

- **37 new real-database cases** pass, covering pagination/privacy, current capability,
  both reviewed versions, actual root worker behavior before/at an edited due time,
  cancelled actions with zero publication/delivery, current creation replay, unchanged
  edits, stale/concurrent mutations, terminal/RUNNING status, time/expiry, strict input,
  transactional audit rollback, archive, post-publication cancellation and system-job refusal.
- Five real Event-lock waits observe archive, deactivation, another edit, a worker claim
  and elapsed time. A real action-lock wait samples cancellation completion time afterwards.
  The prior focused run also passed the existing creation/status and route-isolation suites.
- **80 shared checks**, **562 server units**, workspace types, shared/server builds, lint,
  architecture (**944 modules / 4,115 dependencies**), hardcoding, generated settings and
  source/shared/new-fixture/full-history secret scans pass.

- Full integration passes **1,266 checks / four existing skips in 90 files** (451.70 seconds).
  Changed formatting/diff checks pass; the temporary awake hold was restored in `finally`.

D-11 source `5ea2d31358cd21659331a70d040698a20861ea27` and tracker
`522635f010bc5c41812c87e864c3017a869796d6` were committed and pushed directly to main.
[CI](https://github.com/aadk979/SPOH_2027/actions/runs/37127764523) and
[staging deploy](https://github.com/aadk979/SPOH_2027/actions/runs/37127984874) succeeded.
At 22:17 Singapore, the stack was `UPDATE_COMPLETE` and application task definition
revision 98 used that exact tracker image. Only guarded
`spoh2027_test`, the existing 30 migrations and no new migration are involved.
A Docker runtime-socket recurrence was repaired reversibly;
the existing container/volume and real database were preserved. No production resource,
pricing artifact, sibling `V1` or visual baseline changed. P10.7/P10.8 remain open.
