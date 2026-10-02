# P10.7 — Stored report reads and exports

P10.7 remains open. Completed DAILY and FINAL documents now have event-scoped list, detail
and CSV/XLSX export APIs under `/reports/snapshots`. All three require the existing current
`report.generate` capability and sensitive rate limit. The response is `no-store`. Missing
and foreign ids/cursors return the same 404; an event without membership remains unavailable.
This does not expose scheduler creation or add archived membership access.

The list defaults to 20 rows, allows at most 50 and optionally selects DAILY or FINAL. It
returns kind, lifecycle version, freeze time, saved range, practice inclusion and supersession
time. SQL projects only range metadata from the JSON document; it never loads full bodies
for a list. `(createdAt, id)` pagination handles tied timestamps and newly inserted documents,
and the cursor and page share a repeatable-read transaction. A kind-changing/foreign/missing
cursor is refused rather than silently starting a different page.

Detail reads parse the immutable stored body through `FullReport`, verify practice provenance
against the row and overlay the authoritative snapshot metadata. They neither regenerate
current results nor rewrite/audit a stored document. Malformed stored bodies or inconsistent
provenance fail closed through the private error response. Daily snapshots never replace the
active frozen FINAL used by the existing default whole-event report.

Exports use the same stored document, include the saved practice label and identify DAILY or
superseded FINAL distinctly. The filename contains the snapshot id; corrected daily documents
can coexist without indistinguishable filenames. The shared provenance label is also available
to the client. Existing current/final exports retain their behavior. Stored snapshot exports
have **no current visitor sheet**: they contain only the immutable report, which excludes visitor
values and transient lost-person descriptions. Operational notes/staff names retain the report's
existing role/access and later retention boundary. Browser selection UI remains pending.

Verification on 3 October 2026:

- **108 focused database checks in seven files** pass, including 21 new read/export cases,
  scheduled generation, close/reopen and the complete route isolation inventory. Tests cover
  corrected captures, tied timestamp paging/new inserts, practice provenance, superseded versus
  active finals, current permission removal, foreign scopes, strict selections, corrupt stored
  bodies and both actual export formats. Tests use only localhost:5435 `_test` databases.
- All workspace types, **538 server units**, **23 shared units**, **262 client units**, root
  lint/architecture, hardcoding, generated settings and shared/server builds pass. Initial
  compile issues (duplicated enum and nullable fixture JSON input) were corrected before the
  passing checks. The fixture uses unique reader subjects so requests do not share a sensitive
  rate bucket; isolation comparisons omit only per-request correlation ids and computed times.
- Six serial browser journeys pass across fresh disposable-API groups: phone/laptop real-worker
  DAILY list/detail/CSV reads and saved practice labels, close-out labels/exports and reopen/new
  final evidence. The combined close/reopen group initially exhausted the admin/sensitive limits;
  its screenshot and trace were inspected (report 429). Both reopen journeys then passed on a
  fresh API, with the production limits unchanged. Synthetic queue/document/audit receipts stay
  in the dedicated E2E database; other fixtures are restored Event-first.
- Full integration: **1,019 passed/four existing skips, 81 files**. No schema, client layout,
  visual baseline or infrastructure definition changes. These checks are not a new visual run.
  The final read/isolation rerun passes **31 checks**; changed formatting and diff checks pass.

Scheduling CRUD/UI, automatic report declarations, remaining catalogue handlers and the wider
lifecycle/authorization/retention dependencies keep P10.5/P10.7 open.
