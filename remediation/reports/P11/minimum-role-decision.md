# Minimum-role decision — 6 October 2026

**Status: 45 fixed floors approved; visitor eligibility still pending.** On
6 October 2026 the human owner selected **“Approve lowest-default floors
(recommended)”** for all 45 Editable actions with default grants. That approval
authorizes option A below for those actions only. It does not approve a floor,
grant or eligibility rule for `VisitorRecord.Read`, whose separate question is
still pending. This records the fixed-floor part of
[ADR-005 §4](../../../docs/adr/ADR-005-authorization-avp.md); no policy, default
grant, current enforcement, tracker completion or production approval changes.

## What the decision controls

A minimum role limits which roles a platform admin may enable for an Editable
action in an event's permission editor. Meeting the floor makes a toggle eligible;
it does not grant the action. The event's grant must also be present, the caller
must have current authority, and all resource, privacy and lifecycle guards still
apply. Defaults remain the approved initial grants unless changed through the
later audited event editor.

The fixed rank order is Volunteer 10, IC 20, Deputy Coordinator 30, Chief
Coordinator 40, Lead 50 and Admin 60. An event may rename the labels without
changing those identities or ranks.

## Complete inventory of the 46 Editable actions

Verified against the accepted P05 schema and `default-grants.json`, preserved in
`packages/access-policies`. The listed lowest currently granted roles are now
also the **owner-approved immutable floors** for the 45 granted actions. The
ungranted visitor exception remains unresolved.

| Lowest approved default role | Rank |  Count |
| ---------------------------- | ---: | -----: |
| Volunteer                    |   10 |      8 |
| IC                           |   20 |     12 |
| Deputy Coordinator           |   30 |      8 |
| Chief Coordinator            |   40 |     17 |
| Lead                         |   50 |      0 |
| Admin                        |   60 |      0 |
| No default grant             |    — |      1 |
| **Total**                    |      | **46** |

### Volunteer — 8 actions

| Action                |
| --------------------- |
| `Card.Stamp`          |
| `Footfall.Create`     |
| `Gift.Redeem`         |
| `Incident.Report`     |
| `LostFound.Claim`     |
| `LostFound.Log`       |
| `LostPerson.Raise`    |
| `Registration.Create` |

### IC — 12 actions

| Action                     |
| -------------------------- |
| `Announcement.SendStation` |
| `Card.Reissue`             |
| `Card.Void`                |
| `Count.Adjust`             |
| `Dashboard.ReadStation`    |
| `Incident.Read`            |
| `Incident.Update`          |
| `LostPerson.Resolve`       |
| `Record.Void`              |
| `Roster.ReadStation`       |
| `Structure.Read`           |
| `Swap.Decide`              |

### Deputy Coordinator — 8 actions

| Action                   |
| ------------------------ |
| `Announcement.SendEvent` |
| `Dashboard.ReadEvent`    |
| `Fallback.Declare`       |
| `LostFound.CloseOut`     |
| `People.Read`            |
| `Report.Export`          |
| `Report.Generate`        |
| `Roster.Edit`            |

### Chief Coordinator — 17 actions

| Action                 |
| ---------------------- |
| `Audit.Read`           |
| `Card.GenerateBatch`   |
| `Content.Edit`         |
| `Content.Publish`      |
| `Event.Close`          |
| `Event.GoLive`         |
| `Event.MarkReady`      |
| `Event.Rehearse`       |
| `Fallback.Import`      |
| `People.AssignRole`    |
| `People.Deactivate`    |
| `People.Invite`        |
| `People.Update`        |
| `Schedule.Manage`      |
| `Settings.ManageEvent` |
| `Structure.Change`     |
| `Structure.Edit`       |

### Lead and Admin — zero additional lowest-role groups

These roles hold existing grants, but no Editable action is first granted only
at Lead or Admin. This is a rank catalogue with deliberately nonmonotonic grant
sets: higher rank does not automatically confer every lower role's permissions.

### No approved default grant — `VisitorRecord.Read`

This action is Editable but appears in **none** of the six default grant sets.
There is no lowest-default floor to copy. Do not silently invent an Admin floor,
grant the action by default, or remove the existing field-scoped access.

[ADR-002 §4](../../../docs/adr/ADR-002-configurable-taxonomy.md) requires reads to
respect each visitor field's reader roles; current P09 contracts permit all six
catalogue roles to appear in those allowlists. Those privacy controls remain
mandatory. The owner must explicitly define how the new action's grant eligibility
interacts with that existing model before its permission toggle or enforcement
migration is completed. This exception remains visible in both choices below.

## Existing protections the floor decision cannot relax

These requirements are already specified by ADR-005 and approved C1–C13. They
remain enforced independently of the chosen floor and of any event grant.

| Protection                                        | Source and effect                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current active identity and event scope           | ADR-005 §1/§3: inactive people or memberships cannot act; a membership cannot act on another event's resources. Current organisation/event ownership and authority checks remain required.                                                                                               |
| People self-mutation and escalation               | C5 and locked guardrails: no editing, deactivation or role assignment on yourself or a peer/superior; no invitation/role grant at or above your own rank; missing granted-rank evidence is refused. Only platform admins may create event Admins.                                        |
| Separate role assignment                          | C5: `Roster.Edit` does not implicitly grant `People.AssignRole`; a roster import cannot smuggle a role change through a roster permission.                                                                                                                                               |
| Capture station and phase                         | ADR-005 §3 and C11: capture requires a running station shift, or an assigned station in REHEARSAL, unless the fixed role permits the audited station bypass. Capture phases are REHEARSAL/LIVE, plus server-admitted late sync in CLOSED; DRAFT/READY/ARCHIVED remain closed to capture. |
| IC roster reads and station sends                 | C3/C4: these stay within assigned stations; increasing a grant cannot remove that station restriction.                                                                                                                                                                                   |
| Archived read-only state and structure freeze     | ADR-005 §3: ARCHIVED refuses writes, including platform-admin writes. `Structure.Change` is forbidden in LIVE/CLOSED/ARCHIVED; relabelling/deactivation remains separately controlled through `Structure.Edit`.                                                                          |
| Privacy/security and privileged lifecycle actions | C9/C13: `Settings.ManageSecurity`, `Settings.ManagePrivacy`, `Permissions.Edit`, `Event.Reopen` and `Event.Archive` are locked, non-Editable platform-admin actions. None gains a role toggle through this decision.                                                                     |
| Self-service ownership                            | C1/C2/C12: briefing completion requires the assigned briefer, announcement acknowledgement requires its audience, record/shift actions require their owner, and check-in retains attendance/running-shift conditions. These actions remain outside Editable grants.                      |
| Attendance root and verification                  | C10 and attendance policies: code issuance requires today's verification or the valid configured root; root-only attendance behavior cannot be granted through the Editable catalogue.                                                                                                   |
| Visitor field readers and privacy lifecycle       | ADR-002 §4/§5: an action grant cannot expose fields outside the permitted reader roles or bypass event mode, retention, purge, safe audit/retry handling or export restrictions.                                                                                                         |
| Business and go-live guards                       | ADR-004/current P10: permission to request a transition does not supply missing readiness evidence, waive archive guards or authorize production creation/cutover. The 28 October go decision and other owner approvals remain intact.                                                   |
| Policy-store authority                            | ADR-005 §2/§7: only platform admins edit event grant data; changes are audited and invalidate access caches. The application never writes or deletes policies, and event admins cannot edit locked guardrails.                                                                           |

Several C1–C13 rows specify **default cells or action decomposition**, rather than
a permanent ban for that role. C6 leaves `LostFound.CloseOut` off for Lead, C7
adds `Structure.Read` to IC/Lead, and C8 retains card-batch generation for
Chief/Admin by default. The approved policies do not contain a locked
Lead-specific ban for close-out. Existing defaults must remain unchanged; whether
a platform admin may deliberately enable a currently absent higher-role grant is
the permission editor's eligibility contract, not automatic rank inheritance.

## How the floor ambiguity was resolved

The accepted schema declares Editable membership but has no minimum-role metadata.
The defaults declare initial grants. Neither C1–C13 nor ADR-005 originally said to
derive an immutable minimum from the lowest initial grant; the owner's explicit
6 October approval now resolves that choice for the 45 granted actions.

For example, `People.Read` initially starts at Deputy (30). The ADR explicitly
rules out `People.*` for Volunteer (10), but does not distinguish an IC floor
(20) from a Deputy floor (30). Both reproduce every current default cell; they
allow different future delegation. The owner selected Deputy, matching its lowest
approved default. Likewise, the approved correction and configuration floors use
their listed lowest defaults. The eight currently Volunteer-granted actions
already occupy the lowest rank; the other 37 granted actions now have the fixed
boundaries listed above. `VisitorRecord.Read` has no initial floor evidence and
still needs a separate owner decision.

A simple minimum-rank rule also cannot encode every default exclusion. Under a
Volunteer capture floor, Lead (50) becomes eligible for a deliberate capture
grant although its default remains off. Under a Deputy close-out floor, Lead
becomes eligible although C6 leaves its default off. Making those exclusions
permanent would require an additional owner-approved eligible-role rule.

## Choices presented to the owner

| Choice                                             | Exact scope                                                                                                                                                                                                                                                                     | Consequence                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — lowest approved default role (recommended)** | Set the fixed floor for each of the 45 initially granted actions to the role listed above. Preserve every existing default grant and all locked protections. Keep the ungranted `VisitorRecord.Read` exception unresolved until the owner explicitly defines its eligibility.   | Gives a complete, reproducible conservative rule for those 45 actions. Platform admins may remove grants and enable roles at/above the selected floor; they cannot delegate below it. This newly immutable restriction requires approval. |
| **B — owner-defined broader delegation**           | Preserve existing defaults, but supply explicit per-action lower floors or eligible-role sets where wider delegation is wanted. `People.*` remains unavailable to Volunteers, locked actions remain non-Editable, and the visitor-reader exception must be explicitly resolved. | Allows choices such as IC eligibility for `People.Read` or a specifically approved lower correction floor. Requires an explicit decision for each exception; no lower floor is inferred from rank or from a requested event grant.        |

For either choice, an owner-approved rule for `VisitorRecord.Read` must say which
roles may receive its event grant, keep new-event defaults ungranted unless a
separate default change is approved, and preserve the per-field reader
intersection. Current P09 visitor access remains protected during that migration.

**Recorded decision:** option A is approved for all 45 granted actions. The
authored `packages/access-policies/minimum-roles.json` and generated catalogue now
contain those floors; validation rejects missing, lower, higher or unknown
substitutes instead of deriving replacements from mutable event grant data.
Locked actions carry `locked` metadata; `VisitorRecord.Read` carries `unresolved`
with no invented role or rank. Future permission editing must refuse both states.

**Remaining owner decision:** explicitly resolve `VisitorRecord.Read` eligibility
while preserving field-reader restrictions and unchanged new-event defaults. Its
question is pending; no answer, permission migration or phase completion is
inferred. Independent editor, pipeline and readiness work continues.
