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
  evidence scans find no leaks.

CI [37141395948](https://github.com/aadk979/SPOH_2027/actions/runs/37141395948)
and staging deployment
[37141784321](https://github.com/aadk979/SPOH_2027/actions/runs/37141784321)
succeeded for tracker `c977832bc2af31d8fffac6bd7bf190fc7ca11950`
(UI source `f0bf5db`). CloudFormation is UPDATE_COMPLETE; the exact image runs on
ECS revision 104 with desired/running 1, completed rollout and zero failed tasks.
At 01:57 Singapore on 4 October, installed Chrome 154 verified normal Cognito
sign-in, strict no-store API responses for every status, the expanded settings UI,
All statuses, hard reload, hover accessibility with zero axe violations, zero page
errors and normal sign-out. The [sanitised evidence](staging-schedule-timeline-ui-evidence-2026-10-04.json)
records this read-only staging journey. No schedule, lifecycle, announcement or
external delivery writes were requested.

This completes the bounded general metadata list/status/error view. Authorised
general create/edit/cancel consumers and generated settings/history/revert still
retain P10.8's full exit criteria. The step and phase remain open.
