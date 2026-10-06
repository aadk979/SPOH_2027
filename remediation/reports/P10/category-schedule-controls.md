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
The interrupted local audit command differed from the existing required CI
gate. [Audit command alignment](../P08/dependency-audit-alignment.md) makes
`audit:ci` use the identical existing path/advisory/expiry gate. It passes;
the upstream bundled CDK vulnerability remains explicitly recorded under its
unchanged previously approved exception. No dependency, exception or audit
rule was changed.

## Runtime recovery and repeated acceptance gates

The takeover verified main/origin/main at `7a7aa42` before any edit and retained
all inherited drafts. Docker startup failures identified dead inference and
secrets-engine IPC sockets. With no Docker process active, only their runtime
directories were moved to new recoverable paths. The original
`spoh2027-postgres` container recovered healthy on localhost:5435 with the
original `v1_spoh-pgdata` mount. No database reset, seed or migration was used.

The fresh affected integration run passes **513 checks in 16 files**, including
the final takeover-context repair, real category races and existing reviewed
producer retries. Full client coverage passes **663 checks**, shared coverage
passes **241**, and lint, architecture, generated consistency, hardcoding and
24 delivery safety tests pass. Shared/server/static client rebuilt successfully;
the real static export startup/CSP check passes. Complete server coverage passes
**2,567 checks with four existing skips across 169 files**, covering 5,863/6,130
maintained lines (95.64%) and 3,385/3,880 branches (87.24%). Complete workspace
types and all unchanged package floors pass.

Independent browser-harness review repaired a capture-category pagination race
and tightened local restoration provenance: current activity and timestamp
must match a successful owned action and unchanged category definition before
public restoration. Mutation responses also require no-store. The prepared
staging harness passes all 13 pure guards; no staging attempt is claimed here.

The first four browser journeys reached their retry/edit/cancel and real worker
effects, but each failed accessibility acceptance because `role="group"` on
`li` replaced its native list-item semantics. All owned cleanup completed;
the excluded traces remain in ignored `.local/category-browser-a11y-first-20261006`.
The row now retains a native list item around its named group. Fresh complete
client coverage remains **663 passed**, and affected types/lint pass. The repaired
static build and startup/CSP checks pass after the correction. All four fresh
phone/laptop browser journeys pass: two identical-request lost-receipt retry,
edit and cancellation checks (11.6 seconds), plus two real worker inactive and
active changes with already-open booth admission and owned public restoration
(12.0 minutes). Database and browser execution remained serial.

Eight new category panel states and the two affected settings route images pass
targeted baseline establishment. Independent image review finds no clipping,
overlap or horizontal overflow at either width. A visual cancellation selector
initially matched both Active and Inactive groups; an exact accessible-name
match repairs the fixture without changing the application. Baseline iteration
is excluded from final acceptance. The added settings section also shifts the
six existing laptop capture panel crops by fractional pixels. Independent
before/after review confirms identical content, controls and disabled states;
only vertical pixel shifts and font antialiasing differ. Their targeted updates
pass. A full-run credential primer initially exhausted the frozen sensitive
rate window after 60 passing checks. The helper now verifies all fixture
identities once per worker, with each test retaining its own application session;
the limit and clock remain unchanged. Failed runs are excluded.
All eleven affected laptop catalogue crops also receive independent before/after
review with unchanged values, versions, history and controls. The final fresh
**100-check visual comparison passes in 3.1 minutes**, with updates disabled.
The retained nine membership rows and eight person markers match before and
after. Complete application CI and exact-image normal Cognito staging acceptance
remain pending.
Staging keeps READY and exercises legitimate owned definitions and worker
restoration through the public interface. No real local `spoh2027` reset, seed
or migration, production creation or cutover is authorized by this milestone.

P10.7/P10.8 and G3 remain open for broader taxonomy, scheduling, legacy consumer
migration, lifecycle and readiness criteria. Station/type timed activity and
remaining administration are retained scope; this category producer does not
claim them complete.
