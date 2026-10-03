# Product setting history read — P10.8

Current event configuration managers can read bounded, newest-created-first history
for **product.countsMode** and **product.visitorDataMode** through
`GET /admin/event-settings/history?key=…`. These are the two product settings whose
guarded application consumers already exist. The strict contract returns the key,
version, source, event-clock evaluation instant, creation time, bounded reason,
whether the current person made the change and schema-validated values. It omits
actor identity and scheduled-action links. Invalid historical JSON is represented
as **values unavailable**; it cannot be forwarded as arbitrary data. An invalid or
missing before value becomes null. A RESET entry shows the registry default as its
effective after value while retaining its RESET source.

Each no-store page holds Event in SHARE mode first, rechecks current membership and
config.manage under a membership lock, then evaluates the clock after any wait.
ReadCommitted transactions have the existing 30-second bound. Queries require the
supported key and accept only bounded pagination. Cursor lookup and the immutable
creation-time/ID bounds name the exact event, EVENT scope, scopeId and key. Foreign,
other-key, station, platform, malformed-scope and missing cursors all return 404.
The route is included in the complete cross-event route inventory.

## Verification on 4 October 2026

- All 89 shared checks pass, including five new strict query/value/privacy/result
  contract tests.
- All 24 new history database checks and 17 affected existing product-setting and
  route-isolation checks pass serially on guarded spoh2027_test. They cover all six
  change sources, empty results, tied timestamps, invalid legacy values, bounded
  reasons, system attribution, scope/key/event isolation, permissions and no effects.
  Real Event lock waits verify newly committed rows, a committed demotion and the
  post-wait evaluation clock. The foreign fixture was corrected to use the complete
  event factory input; the route uses the established flat admin inventory structure.
- Server/client types, the server build, root lint, architecture, hardcoding and
  generated settings checks pass. Source/shared/test/evidence scans find no leaks.

CI [37142522457](https://github.com/aadk979/SPOH_2027/actions/runs/37142522457)
and staging deployment
[37142908747](https://github.com/aadk979/SPOH_2027/actions/runs/37142908747)
succeeded for tracker `858c2d67dca8cfe82f2cf58a08134e253054f46b`
(history source `f363cd9`). CloudFormation is UPDATE_COMPLETE; the exact image runs
on healthy ECS revision 105 with desired/running 1, completed rollout and zero
failed tasks. At 02:18 Singapore on 4 October, installed Chrome 154 verified normal
Cognito sign-in, both strict event/key/no-store responses, rejected unsupported
keys/extra scopes/missing cursors, zero page errors and normal sign-out. The established
synthetic fixture has no product-setting history, so staging verifies the empty
read contract; populated cases are covered by the local database checks above.
[Sanitised evidence](staging-product-setting-history-api-evidence-2026-10-04.json)
records this read-only probe. No setting, revert, reset, schedule, lifecycle,
announcement or delivery writes were requested.

This read introduces no write, revert, reset, schedule, schema or migration.
The existing privacy purge, counts-mode/headline validation and versioned writes
are unchanged. Guarded product reverts and the corresponding history UI are the
next bounded consumers; the full generated event/station settings criteria remain
open. This foundation does not close P10.8 or P10.
