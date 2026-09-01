# SPOH 2027 — Event-day runbook

**For:** the Chief Coordinator, Deputy Coordinators, and whoever is on call for the system.
**Event window:** 6–9 January 2027. **Deploy freeze:** from 5 January 2027.

> **Status: partial.** The sections below cover what exists after Phase 3
> (capture, safety, roster, cards, gifts, dashboard, comms). Fallback
> declaration, CSV import and report export are Phase 4 and are marked as such.
> This document must be complete before Dry Run #2 on 4 January 2027.

---

## 0. The one-minute version

| Something is wrong                    | Do this                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| A volunteer says taps are not landing | Send them to **My shift → Sync**. Read the unsynced count.   |
| A station has stopped counting        | Check `/api/v1/footfall/live` — silent stations are flagged. |
| Someone cannot sign in                | They are not on the roster, or not provisioned. See §3.      |
| A count is obviously wrong            | An IC voids the record with a reason. Never edit history.    |
| The app is down                       | Declare a fallback tier. **Chief or a DC only.** See §5.     |
| A child is missing                    | **Call first.** Then raise the alert so the floor searches.  |

**Nobody below Deputy Coordinator declares a fallback tier.** That is how the
same visitor ends up counted in three places.

---

## 1. Before each event day

- [ ] Take a manual RDS snapshot (§6)
- [ ] Confirm `/readyz` returns 200 on production
- [ ] Confirm the roster for today is loaded and every volunteer is provisioned
- [ ] Confirm each station kit has: spare device, power bank, physical clicker,
      laminated fallback QR card, sealed paper pack
- [ ] Open the data-health view and confirm every counted room is listed

## 2. During the day

### Watching for a station that has quietly stopped

`GET /api/v1/footfall/live` returns every counted room, whether or not it has
recorded anything, with `minutesSinceLastActivity` and a `silent` flag. A room
with **zero** activity during event hours is flagged as silent — that is the
case where a counter never opened the app at all, and a total alone would never
reveal it.

Silent for 15+ minutes during event hours means: radio the station.

### Reading the counts correctly

Three separate numbers, never added together:

- **registrations** — people who signed up at the booth
- **roomEntries** — bodies through doors. A visitor in four rooms is four.
- **cards** — journeys. One card can be a family of four.

Every API response states its `unit`. If a report ever shows a single "total
visitors" figure, something is wrong — the system has no such number by design.

### Correcting a bad count

An IC or above voids the record with a required reason. The row stays in the
table and drops out of every count. **Do not delete anything** — reconciliation
depends on being able to see what was corrected and why.

```
POST /api/v1/registrations/:id/void   { "reason": "..." }
POST /api/v1/footfall/ticks/:id/void  { "reason": "..." }
```

An IC keying in a physical clicker total uses `POST /api/v1/footfall/bulk`,
which is source-tagged so it stays distinguishable from app taps in every report.

## 3. Somebody cannot sign in

| Symptom                      | Cause                                   | Fix                                                     |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------- |
| `NOT_PROVISIONED` (403)      | Valid account, not on the roster        | Chief provisions them: `POST /api/v1/roster/volunteers` |
| `ACCOUNT_INACTIVE` (403)     | Deactivated                             | Reactivate through provisioning                         |
| `UNAUTHENTICATED` (401)      | Expired or bad token                    | Sign in again                                           |
| `STATION_SCOPE_DENIED` (403) | Not rostered at that station, right now | Fix the roster, or an IC captures on their behalf       |

Station scope is checked against the **database**, not the token, because
station assignment changes hourly and group membership does not. It also
requires a shift block to be currently running — outside event hours nobody is
on shift, which is deliberate: it stops a counter left open overnight from
writing.

## 4. Safety flows

### Lost person

1. **Call first.** The app coordinates a search; it is not the emergency channel.
2. Any volunteer raises the alert. It reaches every device within 10 seconds.
3. Volunteers acknowledge. The ack count tells the Safety IC how much of the
   floor has actually been reached.
4. An IC or above resolves it. The alert clears everywhere.
5. 24 hours later the description is automatically deleted and only an
   anonymised summary survives (`LostPersonSummary`).

The post-event report says "3 cases, all resolved, median 7 minutes". It never
contains a description of a child. This is automatic, not a manual step.

To force the purge early: the job runs every 15 minutes in-process; restarting
the server runs it on the next tick.

### Incidents

Immutable once submitted. Updates go into the append-only follow-up log. An IC
or above changes status. This produces the incident log for the post-event
report directly, rather than reconstructing it from memory a week later.

## 4a. Mission Cards, gifts and comms

### A card will not scan

Type the six-character code instead. It is printed on every card, and the input
sits beside the camera rather than behind a toggle. If neither works, stamp the
card physically and carry on: the physical card is the keepsake and the
authority, and the system only mirrors it. You lose journey data for that scan,
not the visitor.

### A visitor has lost their card

An IC reissues against a fresh card:

```
POST /api/v1/cards/:oldCode/reissue
  { "reason": "...", "replacementShortCode": "NEWCODE" }
```

The stamps carry over and the original is voided in the same transaction, so one
journey can never be redeemed twice.

### Gift stock looks wrong

Stock is derived, never stored: initial + adjustments - redemptions. The
redemption log is the truth. Do not try to correct a total; record an adjustment
with a reason and the derived number follows:

```
POST /api/v1/gifts/:id/adjust   { "delta": -50, "reason": "..." }
```

Low stock surfaces on the Chief dashboard automatically.

**Out of stock is the only hard stop in redemption.** Unknown card, incomplete
card, and a second gift against one card are all warnings the volunteer can
confirm through, because a card that will not scan must never stop a visitor who
walked the whole journey.

### Announcements

Only **Urgent** is eligible for a push; everything else lands in the inbox. Use
it sparingly - volunteers who receive forty pushes stop reading pushes by 11am.
An IC may address their own station; event-wide needs a Deputy Coordinator or
the Chief.

## 5. Fallback tiers — **Phase 4, not yet built**

The tier ladder is defined in PRODUCT_BRIEF §11. Declaration, closure and CSV
re-import are Phase 4 work. What exists today:

- `FallbackWindow` rows can be created directly in the database, and every
  summary endpoint already reports `containsFallbackData: true` for any range
  that overlaps one.
- The Google fallback pack and the paper packs are **operational preparation**,
  not code, and must exist and be exercised at Dry Run #1 regardless of whether
  the import path is finished.

**Before Dry Run #1 (18 Nov):** build the Google pack, set permissions, print
the laminated station cards, and run one full station on Tier 3 for 30 minutes.

## 6. Backups and rollback

- RDS automated backups, 7-day retention
- **Manual snapshot before and after each event day**, and on 5 January
- Rollback: redeploy the previous image. Migrations are forward-only — do not
  roll a migration back mid-event; correct forward instead.

## 7. Alarms worth having

| Alarm            | Threshold | Means                                         |
| ---------------- | --------- | --------------------------------------------- |
| API 5xx rate     | > 1%      | Something is broken. Check logs by requestId. |
| p95 latency      | > 1s      | Taps are feeling slow at the booth.           |
| RDS CPU          | > 80%     | Unexpected at this volume. Investigate.       |
| RDS free storage | low       | Should never happen at 60k rows.              |

The **data-health view is the more important monitor**. Silent stations and
stale devices matter more than server metrics: the API can be perfectly healthy
while a station quietly records nothing for an hour.

## 8. Who to call

> **To be completed before Dry Run #2.** Names and numbers deliberately not
> committed to the repository — keep this table in the printed contact card in
> each station kit and in the `FALLBACK_RunbookAndBriefing` Google Doc.

| Role                                         | Name | Phone |
| -------------------------------------------- | ---- | ----- |
| Chief Coordinator                            |      |       |
| Deputy Coordinator (Operations)              |      |       |
| Deputy Coordinator (Welfare, Safety & Comms) |      |       |
| Safety IC                                    |      |       |
| Campus security                              |      |       |
| System on-call                               |      |       |
