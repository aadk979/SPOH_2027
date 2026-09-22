# The audit log

What is recorded, how it gets off the box, and why the screen is shaped the way
it is. Derived from `server/src/lib/audit.ts`,
`server/src/middleware/securityAudit.ts`, `server/src/modules/audit`,
`server/src/lib/cloudwatch.ts` and `client/src/app/admin/audit`. If the code and
this file disagree, the code wins; fix the file.

## Two kinds of row, one table

|             | Change events                                | Security events                                    |
| ----------- | -------------------------------------------- | -------------------------------------------------- |
| Example     | `registration.void`, `user.provision`        | `auth.denied`, `rbac.denied`, `rateLimit.exceeded` |
| Written by  | `writeAudit(tx, …)`                          | `recordSecurityEvent(…)`                           |
| Transaction | **Inside** the mutation's own transaction    | None — nothing changed                             |
| Awaited     | Yes; a failed audit write fails the mutation | No; fire-and-forget                                |
| Carries     | `before` / `after`                           | `method`, `path`, `statusCode`                     |

They share a table so that "what happened around 09:42" is one query rather than
two joined by eye. `severity` and `outcome` are what let a reader tell them
apart, and what the presets on the screen filter by.

The transactional rule for change events is unchanged and is the important one:
a corrective action that left no trace would be worse than one that never
happened, so the audit write shares the fate of the mutation it describes.

Security events cannot work that way — there is no transaction to join, and the
response has already been decided. Awaiting them would add latency to the error
path and give a struggling database a second way to turn a 403 into a 500. So
they are fired and forgotten, and if the database write fails the event is still
shipped to CloudWatch, tagged `persisted: false`.

## Grading

`severity` is set once in `lib/audit.ts`, not at the fifty-odd call sites.

| Severity   | What lands there                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INFO`     | Ordinary captures and reads. The bulk.                                                                                                                                              |
| `NOTICE`   | Corrective actions — voids, adjustments, reissues — and anything that changes who can do what.                                                                                      |
| `WARNING`  | Refusals, station-scope bypasses, fallback declarations, 5xx.                                                                                                                       |
| `CRITICAL` | `session.reuseDetected` (a replayed refresh token is a stolen one until proven otherwise) and `auth.untrustedOrigin` (a credential-minting request from an origin we do not serve). |

Filtering on severity means **at that level and above**, because the screen says
"Warning and above" and an exact match would hide exactly the rows somebody
reached for the filter to find.

`outcome` is the cross-cutting one: every refusal is `DENIED` regardless of
which check refused it, so one filter finds all of them.

## Why refusals are throttled

Recording every refusal verbatim hands an unauthenticated caller a write
primitive. A loop against any 401 endpoint would fill the audit table faster
than the event fills it in a day, and the table that is supposed to explain the
incident becomes the incident.

So identical refusals collapse into one row per minute, keyed on
`action | actor-or-IP | method | route`. The row that opens the next window
carries `suppressedInPreviousWindow`, so the true count is recoverable from the
log alone. Two hundred identical lines say exactly what "×200" says.

The key uses the authenticated subject where there is one, because the
interesting pattern is _one caller, many refusals_ — and a volunteer who moves
from campus Wi-Fi to mobile data is still one caller.

Query strings are stripped from the recorded path. A query can carry a card code
or an email, and this table is read by more people than the row's subject.

## Pagination

There is no shape of request that returns the whole table. `limit` defaults to
50 and is capped at 200, there is no offset parameter, and the two directions of
travel are mutually exclusive:

- **`cursor`** pages backwards through history, newest first. The query asks for
  `limit + 1` rows and drops the extra, so `hasMore` is known without a
  `COUNT(*)` — which on this table is the query that takes the database down at
  10am. `nextCursor` is `null` at the end rather than the last id, so a client
  that reaches the bottom stops asking.
- **`sinceId`** tails forwards from a row the client already holds, oldest
  first, so the screen appends rather than reconciles. A tab left open for an
  hour asks for the oldest 50 rows it is missing and asks again — never one
  enormous response.

The tail's ordering tiebreaks on `id` within the same timestamp. Two rows
written inside one transaction share a `createdAt` to the millisecond, and
without the tiebreak the second one is never delivered.

An unrecognised `sinceId` — a client holding an id from before a redeploy or a
purge — falls back to a normal first page rather than returning nothing forever.

## The screen

`/admin/audit`, capability `audit.read` (Chief Coordinator, Lead, Admin).

Presets first, because an admin arrives with a question rather than a filter
combination: _Refused_, _Security_, _Corrections_, _Access changes_, _Needs a
look_. Touching any raw control drops the preset, since it no longer describes
what is shown.

**Live** tails on a five-second poll. History never refetches on its own — a
list that reshuffles while somebody is reading row 40 is worse than a stale one.
Turning Live off leaves the accumulated rows in place so the reader keeps their
position.

Rows are collapsed to one line. `before`/`after` are the reason this table is
large, and rendering fifty payloads turns a scan into a scroll.

## Getting it off the box

Postgres and the audit trail are on the same instance, so whatever kills one
takes the other with it. `CLOUDWATCH_AUDIT_LOG_GROUP` ships every row to a log
group as well.

Delivery is buffered, batched every two seconds, bounded to 10,000 queued events
(oldest dropped first, and counted), and backs off to a minute on repeated
failure. It never throws into a request path: a CloudWatch outage degrades the
trail to database-only, it does not fail captures.

The screen shows delivery state in a banner — group, region, events delivered,
and the outstanding error if there is one. A trail that stopped shipping on
Tuesday should say so where somebody is looking, not only in the log it is
failing to deliver.

Setup, including the IAM instance profile the box does not yet have, is in
`ops/cloudwatch/README.md`.

`CLOUDWATCH_SHIP_APP_LOGS=true` additionally mirrors the pino request log. Off
by default: at peak the capture endpoints produce more request lines in an hour
than the audit trail does rows in a day, and ingestion is billed by the byte.
The tee receives the line pino has already serialised and redacted, so the
redaction list governs both destinations with no second chance to get it wrong.

## Adding an action

1. Add it to the `AuditAction` union in `server/src/lib/audit.ts`.
2. Add it to `AUDIT_ACTIONS` in `server/src/modules/audit/actions.ts` — the
   compile-time exhaustiveness check there fails if you forget, so the filter
   dropdown cannot silently lose an action.
3. Grade it in `SEVERITY` / `OUTCOME` if it is anything other than
   `INFO` / `SUCCESS`.
4. Call `writeAudit` with the transaction that performs the change.
