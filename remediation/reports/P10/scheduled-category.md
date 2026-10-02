# Timed category activity — P10.7

`taxonomy.setActive` is registered in the actual API worker for the strict category-only
payload `{ kind: "category", id, active }`. Its one-off user creator must currently have
an active membership with `config.manage`. Event identity comes from the action; foreign
category ids, missing targets, system/platform creators, user recurrence and unsupported
station/type kinds are refused. ARCHIVED remains read-only.

The module's supplied-transaction mutation takes Event UPDATE before reading or writing
the category. Captures take Event SHARE. Waiting writes therefore observe current
membership/lifecycle/category rows; admitted captures finish before deactivation, and
subsequent captures see the committed state. No nested transaction, retry reservation
or external delivery is created. The desired state is absolute, as ADR-004 specifies;
unlike versioned settings, it has no invented category version. A matching current value
completes with a schedule outcome receipt without editing `updatedAt` or fabricating a
category change audit.

Actual changes preserve ids, codes, labels, order and historical counts. The injected
worker clock supplies `updatedAt`; activity, metadata-only attributed SCHEDULE audit and
completion commit together. Four failure boundaries roll back activity/audit before a
clean retry. A stale executor cannot repeat the successful occurrence.

Open booth/group category queries now refresh at the existing live dashboard polling
cadence, with event-scoped cached categories retained for offline use. The server remains
the authority for admission and valid CLOSED pre-close device receipts. No schedule CRUD,
taxonomy editing screen, station/type timed activity or schema change is introduced.

Verification: **77 focused database checks in three files**, including **35 new cases**,
passed. Full integration passed **1,069 checks/four existing skips in 83 files** (380.78
seconds), with a temporary wake hold restored on exit. All workspace types, **538 server
units**, **262 client units**, server build, lint, architecture, hardcoding, generated settings,
changed formatting and diff checks pass. Twelve serial browser journeys passed against the
rebuilt disposable API, including phone/laptop actual-worker category pause/resume on an open
booth, current API admission, existing timed capture settings and offline/CLOSED capture.
The fixtures restore category/count state Event-first and retain immutable synthetic receipts
only in the dedicated E2E `_test` database. No client layout or visual baseline changed;
these checks do not claim a new full visual run.
P10.5/P10.7 remain open for their full exit criteria.
