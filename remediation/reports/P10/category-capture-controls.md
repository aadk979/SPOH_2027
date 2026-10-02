# Category capture admission — P10.7

## Result and boundary

Ordinary and group registration now require an active category after taking the shared
Event admission lock. A mixed group refuses atomically, including a provisional card
issuance. Completed retry keys still replay their original receipt. Historical counts
and labels remain in reports after a category disappears from the booth buttons.

Valid pre-close device receipts retain CLOSED's existing bounded offline grace, including
group receipts for an inactive category. Missing, at-close and expired receipts remain
refused. Activity does not create a new late-sync exception.

Registration import planning includes only active categories and retains existing row-issue
and partial-import behavior. The commit rechecks planned category ids in its supplied
transaction after Event admission. Deactivation between planning and commit therefore
rolls back the batch, counts and audit. Imports have no CLOSED offline grace.

The cross-module import recheck lives in `platform/db`, beside shared capture admission.
Registration's single/group resolution stays inside its own module. This avoids the
registration-summary/fallback dependency cycle without suppressing architecture rules.
Every future category writer must take the exclusive Event lock before changing activity;
the timed category writer is the next slice. No scheduling endpoint or taxonomy editing
screen is introduced here.

## Verification

Fifteen new database cases cover LIVE/REHEARSAL single and group refusal/resumption,
card rollback, completed replay, historical reports, bounded CLOSED receipts, preview/
commit row issues, mixed imports, foreign ids and both Event-lock orderings. The HTTP tap
waiting test observes its idempotency reservation's Event foreign-key lock, which can
precede application admission; import commits wait on the Event SHARE lock directly.

The initial focused run corrected two fixture expectations: committed import responses
use HTTP 201, and HTTP taps may wait at retry reservation before Event admission. The
focused four-file run then passed 76 checks. Lint caught an oversized group orchestrator;
category resolution was extracted. Architecture caught three cycles in an initial public
registration helper; moving the shared import guard to `platform/db` removed them.

The first full run had 1,032 passes, four existing skips and two failures. Windows power
events confirm Modern Standby from 02:40:29 to 02:51:21 SGT: a scheduler fixture setup hook
timed out during that interval and its successor encountered a duplicate fixture slug.
A full rerun passed **1,034 checks/four existing skips in 82 files** (341.63 seconds),
using a temporary system-awake hold restored on process exit. Ten serial browser journeys
passed against the rebuilt disposable API, including ordinary/offline capture, CLOSED
incident receipt admission and actual-worker timed capture pause/resume on phone and laptop.

All workspace types and **538 server units** passed during implementation; final server types,
build, lint, architecture, hardcoding and generated settings checks passed after the helper
move. No schema, client layout, visual baseline or infrastructure definition changed.
P10.5/P10.7 remain open for their full exit criteria.
