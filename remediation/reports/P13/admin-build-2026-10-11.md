# P13 admin build — 11 October 2026

The event workspace now reaches the setup, staffing, correction, audit and close-out
capabilities that the journey audit found accessible only through API requests. This
build is part of the foundation/admin batch under ADR-011. AWS remains torn down.

| Journey gap                                             | Result                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F02-003: setup required API calls                       | Station types/capabilities/tags, stations, visitor categories, event days, shift templates and individual shift exceptions have validated forms. Existing content and attendance controls remain linked from Setup. |
| F02-008: staffing gaps could not be repaired            | A day × shift × station board shows coverage and empty slots, with assignment/unassignment, reviewed CSV import and escalation controls.                                                                            |
| F02-013: no correction screens                          | Recent station-scoped registration/footfall records can be selected for reasoned voids; paper totals and derived gift stock adjustments have forms. Cards support lookup, void and replacement.                     |
| F02-014: volunteers could not request or withdraw swaps | Volunteers can choose an active event member, request a swap and withdraw their pending request. ICs can decide requests. Race tests cover approval versus withdrawal.                                              |
| F02-015: incidents ended after submission               | Incident management lists reports, changes status and adds follow-ups.                                                                                                                                              |
| F02-023: briefing slots were API-only                   | Briefing slots can be scheduled for a selected event day and marked complete.                                                                                                                                       |
| F02-024: audit had no screen                            | The workspace Audit section filters by action, entity, actor and event-clock range, with pagination.                                                                                                                |
| Journey 6: close-out required separate API work         | A guided flow links CLOSED, lost-and-found, fallback closure, the final report, private export pack, ARCHIVED and next year's clone wizard.                                                                         |

Printable mission-card batches now produce private A4 PDF and ZIP exports in S3
`exports`. Downloads use the existing `Report.Export` read permission, including
archived events; generation retains `Card.GenerateBatch` and current authority checks.
Object keys stay out of the public receipt. Ordered card locks protect the unused-card
selection, and each export freezes its exact codes, event name, batch labels and
stamping-station labels. Bundled OFL Noto fonts preserve Latin, Chinese and Tamil text;
labels wrap and card density adapts to the station grid. Oversized or unsupported
labels produce an actionable validation error before publication. An export contains
only one rehearsal/live mode. Storage failure rolls back the receipt and audit. A
successful upload followed by SQL rollback leaves a private inaccessible object for
the existing 90-day lifecycle to remove. Opening gift stock remains immutable;
corrections are derived, audited adjustments.

The saved export list and detail view retain access after a refresh and use the same
read permission as downloads. Pagination checks its cursor against the event and
orders by creation time and id; summaries never expose storage keys or QR payloads.
Details show the frozen selection and labels. Older exports explicitly show unknown
historical context rather than substituting current event data.

Structure creates, capabilities, reactivation and shift hours require the stronger
`Structure.Change` permission during preparation. Labels and deactivation use
`Structure.Edit`. The mutation rechecks current membership authority under the event
lock. Removing a mistaken day refuses existing dependencies and recorded event
capture. Omitted update fields preserve existing values, including tags and tour flags.
New administrative writes have UUID receipts; legacy no-key callers stay compatible.

## Verification

The grouped print suites pass all 140 assertions after adding history routes to the
cross-event inventory. The history suite includes 25 paging, authority and isolation
cases; 36 focused client assertions pass, including 23 history and download-ownership
cases. Four contract assertions cover bounds, legacy context and private-field rejection.
All four pages of a synthetic multilingual PDF render correctly in Poppler without
warnings. An embedded-glyph check guards against valid logical text with missing
Chinese glyphs. The full local CI exit code and exact GitHub CI run will be recorded
before steps close; the earlier green full run predates these print repairs.
Browser journeys are authored for phone and laptop; their execution and measured
time-to-setup belong to P16.1/P16.8, along with the owner's IA walkthrough. No staging
or browser success is claimed here.

The inherited 04:52 UTC complete runner ended without a retrievable session or
final exit code; its partial log is not a completed gate. Focused coverage
reproduced the oversized-grid timeout. A physical minimum-height check now rejects
37- and 100-station grids before accessing fonts, while retaining the existing
readable 30-station layout test. `PrintableCard` now lives in the pure domain leaf,
removing the renderer/layout type-only cycle. The test timeout and coverage floors
are unchanged.

Takeover review also found cached admin data could remain visible after a later
permission refusal. The grouped repair partitions and cancels private readers,
unmounts them on lost authority, and hides stale error-state data for structure,
staffing, incident/audit, visitor/photo, counts/data-health and frozen report
history. Frozen report downloads now fence owner/event/permission/unmount changes
and always revoke their temporary object URL. Regression coverage checks successful
reads followed by revocation, denied refreshes and late responses after switches.

The repaired print unit suite passes eleven tests with coverage and its unchanged
timeout. The three print integration suites pass 46 tests; server typecheck,
architecture and focused lint pass. The eight affected client suites pass 135
assertions, including private-reader revocation and download ownership; client
typecheck and focused lint pass. Corrected complete local and exact-head GitHub
results remain the final build gates.

The complete durable 05:40 UTC runner retained exit **1**. Its only failing test
was the client-call route inventory's missing `GET /incidents`: conditional
optional request options obscured the actual default method. The other 3,013
server tests passed (two existing skips), as did all 971 client tests, 278 shared
tests, 85 policy tests, 104 CDK tests, coverage floors, dependency audit and both
secret scans. Lines/branches: server 96.84/87.87%, client 80.78/73.12%, shared
93.36/82.19%. The inventory repair and corrected complete run remain pending;
no failed or interrupted run closes the batch.

The scanner now resolves conditional default methods and object-spread ordering
without inventing a method for unresolved options. Its four independent regression
tests and the three actual-route inventory tests pass. Incident lists always use
`no-store`; all eight affected client assertions pass, with server/client
typechecks and changed-file lint green. The corrected complete gate follows.

The full Node **24.19.0** gate started **06:18:28 UTC on 11 October 2026** and
retained actual exit **0** at 06:48 UTC. All steps ran with no skip/resume arguments.
Server: **239 files, 3,018 passed and two existing skips**; client: **98 files,
971 passed**; shared: **278**; policies: **85**; CDK: **104**. Lines/branches were
server **96.84/87.87%**, client **80.78/73.11%**, shared **93.36/82.19%**.
All unchanged floors, architecture/source/build guards, dependency audit and both
secret scans passed. The dependency result retains the documented CDK-only
exception, rather than claiming no advisories. An independent read-only review
found no concrete defect in the takeover repairs.

D-11 authorizes this application commit and one main push. Exact-head application
GitHub CI remains the closure gate; its evidence and tracker reconciliation enter
the next P14 batch. AWS remains torn down, and browser/owner acceptance stays in P16.
