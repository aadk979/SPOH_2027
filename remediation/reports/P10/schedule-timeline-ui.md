# Event schedule metadata view — P10.8

Event settings now includes a collapsible **Scheduled work** panel for current
configuration managers. It defaults to Pending and supports every scheduler state
and All statuses. Bounded pages are ordered by creation time, newest first, with
Load more and Reload controls. Event-clock dates show original due times, retry
times and completion; rows show human catalogue labels, status, attempts,
recurrence and bounded outcome explanations. Private announcement text, audiences,
actor identities and action payloads are absent from this API and view.

Reads use the strict shared response contract and reject a different event before
display. Query keys include event, current person and filter; pages are retained
only while observed. Collapsing the panel unmounts its query. Polling uses the
registered dashboard interval and pauses in the background. A failed authority
read hides every cached page and paging control. Permission loss or sign-out
unmounts the view, and person switching cannot display the previous person's data.

## Verification on 4 October 2026

- All 364 client tests in 51 files pass, including 18 new cases for bounded reads,
  all six statuses, cursor reset, empty results, event-clock formatting, strict
  validation and cached-data protection after denial, person switch or sign-out.
- Phone and laptop journeys pass against the dedicated local E2E database and
  normal API/worker. Each creates a legitimate private draft and next-day publication
  schedule, reads its metadata in settings, cancels through the existing reviewed
  private producer and verifies status after reload. Pending schedules are cancelled
  in cleanup even if an assertion fails. No publication or delivery is requested.
  Both expanded hover states have zero WCAG A/AA axe violations and page errors.
- The full frozen visual run passed 56 unchanged routes and found only the two
  expected settings differences. Both actual images were inspected; only those
  phone/laptop baselines were updated, then both assertions passed again.
- Client types, root lint, architecture, hardcoding and generated settings checks
  pass. The production static export generates all 32 pages. Source, tests and P10
  evidence scans find no leaks. Exact D-11 pipeline/image evidence follows deployment.

This completes the bounded general metadata list/status/error view. Authorised
general create/edit/cancel consumers and generated settings/history/revert still
retain P10.8's full exit criteria. The step and phase remain open.
