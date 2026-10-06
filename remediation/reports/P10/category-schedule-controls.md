# Reviewed category scheduling — partial P10.7/P10.8

Capture categories now have a private, event-scoped scheduling producer and
review interface. Managers can list all categories, including inactive rows,
create a reviewed future activity change, edit their own pending actions and
cancel a pending action with current management authority. This uses the
existing `taxonomy.setActive` worker and `ScheduledAction` storage.

Creation and editing review the current category's activity and `updatedAt`
alongside the current event clock. Editing and cancellation independently review
the action version. All mutations take Event UPDATE before current membership,
category and reservation checks, and sample time after lock waits. Definition
audit, action and identifiers-only receipt commit together. Current-authority
reads and retries reconstruct the latest definition through immutable reviewed
audit provenance; unknown, foreign or malformed actions are hidden. Success and
failure routes use private no-store responses. Archive permits protected reads
and receipt reconstruction while refusing new mutations.

The worker still applies the absolute desired activity state specified by
ADR-004. The review snapshot protects the public producer; it is not a new
category revision or due-time compare-and-swap rule. Existing capture admission,
Event SHARE/UPDATE serialization, no-op audit behavior, historical counts,
privacy, lifecycle and worker lease guards remain in force.

The default-collapsed interface requires complete all-status page review before
creation. It uses the event's IANA timezone and an explicit normalized execution
preview. A reason and deliberate confirmation bind the current review. An
uncertain response retains its exact request and UUID in memory for retry.
Transient read failure blocks access and preserves that intent; confirmed
identity or capability loss removes the workspace and private cached data.

## Focused implementation verification

The new shared contracts pass **48 checks**. The producer passes **125 new
database checks**, including **23 real lock/race checks**. Affected isolation,
route contract, RBAC and existing category worker suites pass **130 checks**.
The first authored-fixture run passed 110 and failed 15: terminal scheduler
fixtures lacked required lease/completion fields, and completion-version
expectations omitted existing claim increments. Corrections retain the actual
database constraints and worker behavior; those failed results are excluded.

Independent review found an inherited shared reservation issue: a delayed
original request could enter after an abandoned reservation takeover, and
unconditional response bookkeeping could disturb the winning receipt. The
repair carries immutable HTTP attempt ownership through AsyncLocalStorage,
requires a real scoped unfinished reservation before transactional effects, and
conditionally settles or releases only that attempt. An already committed
identifiers-only receipt is preserved, including its original mutation version.
Five regressions failed before the first repair. A subsequent same-millisecond
start/delayed-read regression exposed a non-advancing takeover timestamp: a
fresh decision-time context now strictly advances past the observed timestamp
before the compare-and-swap and dispatch. Its regression failed before repair.
No schema, migration, role, privacy or lifecycle guard changes.

The final pure idempotency run passes **10 checks**; the complete server unit
project passes **712 checks in 60 files**. The new real-Postgres fencing suite
passes **16 checks**, including delayed responses, same-millisecond starts,
rollback, scope/actor/endpoint mismatch and concurrent context isolation. A
509-check affected integration run passed before the final takeover-context
repair; its final rerun must complete before release and is not accepted from
an incomplete log.

Transient session lookup failure now retains a matched owner's hidden, inert
workspace while disabling reads and writes. Recovery retries the identical
request; confirmed 401/403, authority, identity or clock loss purges the review
and owner cache. Real useMe/QueryClient regressions fail against the former
unmount behavior and pass with the repair. Missing compatibility metadata also
fails closed without crashing the existing settings screen. **78 affected
client checks** pass (68 category checks and ten existing operations checks).
The complete client suite passes **663 checks in 67 files**; shared passes
**241 checks in 18 files**. No coverage floor has changed.

Full lint, architecture (1,185 modules / 5,384 dependencies), hardcoding and both
generated-output checks pass during iteration. The compiled static application
build passes before the final takeover-context and compatibility repairs;
rebuild those changed server/client inputs before browser acceptance.
The final complete workspace type check passes after repairing two test-only
raw/extended Prisma type mismatches; its log is
`.local/handoff-category-types-20261006.log`.
The current required dependency audit fails on the newly reported bundled CDK
`brace-expansion` advisories. It requires a verified repair; no new exception
or weakened audit has been applied. See the latest handoff for exact evidence
and the unfinished runtime/rerun checkpoint.

Browser, visual, complete application CI and exact-image normal Cognito staging
acceptance remain pending. New local journeys must prove lost-receipt retry,
edit/cancel and actual worker inactive/active effects on an already-open booth.
Staging keeps READY and exercises legitimate owned definitions and worker
restoration through the public interface. No real local `spoh2027` reset, seed
or migration, production creation or cutover is authorized by this milestone.

P10.7/P10.8 and G3 remain open for broader taxonomy, scheduling, legacy consumer
migration, lifecycle and readiness criteria. Station/type timed activity and
remaining administration are retained scope; this category producer does not
claim them complete.
