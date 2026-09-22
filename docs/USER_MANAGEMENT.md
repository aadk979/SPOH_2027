# User management and the roster import

How volunteers come to exist, change, and lose access — and every edge the code
handles on purpose. Derived from `server/src/modules/roster`,
`server/src/modules/admin`, `packages/shared/src/rosterCsv.ts` and
`client/src/app/admin/users`. If the code and this file disagree, the code wins;
fix the file.

## The shape of it

There is no sign-up. An account exists because an administrator put the person
on the roster, one at a time or from a file. Six things can happen to a person:

| Flow                                           | Who                                                                        | Endpoint                                                   | Screen                               |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| Add one person                                 | Chief, Admin (`user.provision`)                                            | `POST /roster/volunteers`                                  | `/admin/users` → **Add a volunteer** |
| Import a file                                  | DC, Chief, Admin (`roster.edit`); creating accounts needs `user.provision` | `POST /roster/import`                                      | `/admin/users/import`                |
| Export the roster                              | DC, Chief, Lead, Admin (`user.read`)                                       | `GET /admin/volunteers/export.csv`                         | **Export CSV** on either screen      |
| Edit name / role / manager / phone / portfolio | Chief, Admin                                                               | `PATCH /admin/volunteers/:id`                              | row → **Manage**                     |
| Resend the invite / send a password reset      | Chief, Admin                                                               | `POST /admin/volunteers/:id/resend-invite`                 | row → **Manage**                     |
| Withdraw / restore access                      | Chief, Admin                                                               | `POST …/deactivate`, `POST …/reactivate`                   | row → **Manage**                     |
| Add / remove a shift                           | DC, Chief, Admin (`roster.edit`)                                           | `POST /admin/assignments`, `DELETE /admin/assignments/:id` | row → **Shifts**                     |

Two rules run through all of it (`outranks` in `packages/shared/src/enums.ts`):

1. **Nobody touches their own account.** A Chief who demotes themselves at 09:00
   on the day has locked the only account that could undo it.
2. **Nobody touches, or grants, a role at or above their own.** Otherwise
   `user.provision` is a permission to become an Admin.

Both are enforced in the service (the router's capability check never sees the
target row) and mirrored on the client so no control is shown that would fail.

## Adding one person

`provisionVolunteer(request, actor, audit)`:

| Case                                                                                                                  | What happens                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New email                                                                                                             | Identity minted (Cognito sends the invite), roster row created, audit `user.provision`, cache invalidated. Response says `identityCreated: true`.                                                                                       |
| Email already in Cognito but not on the roster (previous year's pool, or a commit that failed after invites went out) | `ensureUser` catches `UsernameExistsException` and fetches the existing `sub` with one extra `AdminGetUser`. No invite is sent; response says `identityCreated: false` and the screen tells the admin to use _Resend invite_ if needed. |
| Email already on the roster, active                                                                                   | **409 `VOLUNTEER_EXISTS`** with `details.volunteerId`. The form's default role is Volunteer, so "adding" the Room A IC would have silently demoted them. The screen offers _Show their row_.                                            |
| Email already on the roster, deactivated                                                                              | 409 with `details.active: false` and a message to restore access instead. Reinstating is a visible act with its own audit row and identity-provider call; it must not happen as a side effect.                                          |
| Requested role at or above the actor's                                                                                | 403 `ROLE_ESCALATION_DENIED`. The role select on the screen only lists roles below the viewer's.                                                                                                                                        |
| `reportsToEmail` not on the roster / deactivated                                                                      | 400 naming the field.                                                                                                                                                                                                                   |
| Email case and whitespace                                                                                             | Normalised by the schema (`VolunteerEmail` lower-cases).                                                                                                                                                                                |
| Rate limit                                                                                                            | Sensitive tier (20/min per admin). It sends email.                                                                                                                                                                                      |

## Importing a file

### What the browser does first (`parseRosterCsv`)

The file is parsed client-side against the **same zod schema the server
validates with** (`RosterImportRow`), so a bad line is reported by its
spreadsheet line number before any request is made and is left out rather than
failing the whole batch. Handled on purpose:

- **Paste from Excel/Sheets**: tab-separated; delimiter detected from the header
  (`,` `\t` `;`). CRLF and a leading byte-order mark are stripped.
- **Quoted fields**: `"Tan, Mei Ling"` stays one person; `""` escapes; embedded
  newlines survive.
- **Header aliases**: `Full Name`, `Email Address`, `Mobile`, `Team`, `Manager`,
  `Station`, `Date`, `Shift`, `Position`, … all map to the canonical columns.
  Unknown columns (a _Notes_ column) are ignored and named in the summary.
  A file with no name or email column is refused up front.
- **Value aliases**: roles `DC`, `Chief`, `IC`, `Vol`, `Admin`; blocks `AM`/`PM`,
  `Morning`/`Afternoon`; station codes upper-cased.
- **Dates**: `2027-01-07`, `7/1/2027` (day-first, Singapore), `07-01-2027`,
  `2027/1/7`, and an ISO datetime's date part. Anything else is an error that
  says _use YYYY-MM-DD_.
- **Role column absent** means _keep their current role_ (or Volunteer if new).
  Defaulting it would demote every IC in a plain shift list.
- **Subtotal / note lines** (no name and no email) are one error, not two.
- **Row limit**: 1000 per request; the screen says to split the file.

### What the server does (`importRoster(request, actor, audit)`)

The file is **one row per shift**, so a person appears once per shift. Rows are
folded into _people_ by email before anything else. Person fields come from the
first row; a later row fills blanks and is reported where it disagrees.

Per person, decided **before any identity is minted** (an invite cannot be
rolled back):

| Person                                   | Decision                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Exists, is the actor                     | **skip** — "your own account"                                                                                       |
| Exists, deactivated                      | **skip** — names the deactivation reason; restore first. Their shifts are skipped too.                              |
| Exists, role at or above the actor's     | **skip** person — but their **shifts still go in** (rostering an Admin at a booth is `roster.edit`, not escalation) |
| Row's role at or above the actor's       | **skip**                                                                                                            |
| New, actor lacks `user.provision` (a DC) | **skip** — "only a Chief Coordinator or Admin can create accounts"                                                  |
| New, actor may provision                 | **create** (on commit: identity minted outside the transaction, invite sent)                                        |
| Exists, everything allowed               | **update** (name, role, phone, portfolio; blanks keep the existing value; `active` untouched)                       |

Then, in one transaction (rolled back on a dry run so the preview reflects real
constraint behaviour — including the previous bug where two new people shared a
placeholder `cognitoSub` and the preview 500'd):

1. **People** are upserted first so a manager can appear later in the file.
   A dry run uses a per-person placeholder subject (`pending:<email>`).
2. **Reporting lines** resolve against the file, then the roster. Deactivated
   manager, unknown manager, self-reference and loops (including a loop that
   exists only between two rows of the file) are per-row issues.
3. **Shifts**, one per row: needs all of station, date and block (partial → issue);
   unknown station, closed station, unconfigured event day → issue; the same
   person/day/block twice in one file → the later row is skipped; a person
   whose row was refused and who does not exist → skipped.

After a commit: audit `roster.import` with counts; anyone whose **role changed
has every session revoked** and their identity-provider group updated, exactly
as a single edit does; the auth cache is invalidated.

**Re-running the same file is safe**: people become updates, shifts become
"changed", nothing duplicates. That is also the recovery from a commit that
failed after invites were sent.

The response carries `outcomes[]` (per row: `person` create/update/skip,
`assignment` create/update/skip/none) and `issues[]` (row, field, message) so
the screen can show every line's fate, and the commit button can say exactly
what the preview said.

### The export

`GET /admin/volunteers/export.csv` writes the active roster in the import's own
column order, one row per shift (or one row for a person with no shifts).
Export → edit in a spreadsheet → import is the round trip for re-planning a day.
Deactivated people are left out (the import cannot touch them anyway). Cells
starting with `= + - @` are prefixed with `'` so Excel does not run them.

## Resending the invite

"I never got the email" is the support request of the week before the event.

| Account state (Cognito `UserStatus`)           | What is sent                                                                                    | Screen label            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| `FORCE_CHANGE_PASSWORD` (never set a password) | The invite again, with a fresh temporary password (`AdminCreateUser` + `MessageAction: RESEND`) | _Resend invite_         |
| anything else (has signed in)                  | A reset code (`AdminResetUserPassword`); they use _Forgot password_ on the hosted UI            | _Send a password reset_ |
| local dev provider                             | nothing                                                                                         | explained on screen     |

The escalation rules apply here deliberately: a reset forces the target to set
a new password before their next sign-in, so aimed at an Admin by a Chief it is
a lock-out. Deactivated accounts get a 409 (restore first). Audited as
`user.resendInvite`.

## Editing, deactivating, restoring

Unchanged in substance; see `admin/service.ts`. Worth knowing:

- A **role change revokes every session** and syncs the Cognito group, so a
  demotion takes effect on the next tap, not at token expiry.
- **Deactivation** flags the row, revokes sessions, deletes push subscriptions
  and disables the Cognito account — all three, or the account is only half
  locked out. Captured records are kept; they are the event's data.
- **Reactivation** re-enables the identity but does not restore sessions; the
  person signs in again, which proves they still hold the credential.
- **Reporting cycles** are refused (`REPORTING_CYCLE`) because `GET /me` walks
  the chain on every boot.
- **Deleting a shift** somebody has checked in for is refused; the screen shows
  _Worked_ instead of a _Remove_ button.

## What is still manual

- Cognito **group membership is additive**: a role change adds the new group
  but does not remove the old one. The roster is authoritative for
  authorization, so this is cosmetic in the console; `scripts/verify-cognito.mjs`
  is the place to reconcile it.
- Invite **email deliverability** is Cognito's. The screen says to check spam
  and offers a resend; there is no bounce feedback.
