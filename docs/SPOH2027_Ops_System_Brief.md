# SPOH 2027 — Event Operations System

### Solution brief v0.2 · for Chief Coordinator review

**Replaces:** the SPOH26 Excel/Google Sheets hybrid, WhatsApp counter reporting, manual clicker tallies, ad-hoc lost-and-found handling, and the absence of any volunteer orientation material.

**Event window:** 6–9 Jan 2027 (Sec 4 tours 6–8 Jan, SP Open House 7–9 Jan, Discovery Evening 8 Jan)
**Build runway:** Aug 2026 → Jan 2027 · **Hard deadline: Dry Run #1, 18 Nov 2026**

---

## Part 0 — Design principles

### 0.1 Three counts, never merged

This is the load-bearing rule of the whole system. Slides 27 and 47 are explicit: one Mission Card can equal four humans.

| Count            | Owner                                | Unit of measure                                | Question it answers                 |
| ---------------- | ------------------------------------ | ---------------------------------------------- | ----------------------------------- |
| **Registration** | Sign-Up Booth IC                     | 1 record = 1 registered visitor, with category | Who showed up, what profile         |
| **Footfall**     | Visitor Tracking IC                  | 1 tick = 1 body entering a room                | How busy was each station, and when |
| **Mission Card** | Mission Card IC / Gift Redemption IC | 1 card = 1 journey (possibly a family)         | Engagement and completion rate      |

Enforce this in the schema, not just in the UI. Separate tables. No foreign key joining footfall to registration. Dashboards label units explicitly — "412 room entries", not "412 visitors". If someone later asks for a single "total visitors" number, the system should make them choose which of the three they mean.

### 0.2 Strictly analytics, no personal data

Confirmed scope: **no visitor personal data is collected at any point.** No names, no contact details, no school names, no IC numbers, no photographs of identifiable visitors tied to records.

This is a genuine simplification and it should be enforced structurally, not by policy memo:

- Registration writes a **category and a timestamp**. Nothing else.
- Mission Cards carry a **pre-printed random ID** with no link to any person.
- There are no free-text fields anywhere in the visitor-facing flows that could invite a volunteer to type a name in.
- Incident reports describe **what happened and where**, not who. A lost-person alert is the one exception and is handled as a transient broadcast, not a stored record (see §7.3).

Volunteer data is different — you do hold names, roles and shift attendance for your own committee. That's ordinary and fine, but it should live in its own schema with its own access controls, and be deleted or archived after the post-event report is signed off.

### 0.3 Network

Noted that connectivity is not a material risk: the general public and volume traffic don't connect to the SP network, and there's a separate student network with its own bandwidth headroom.

So this is **not** an offline-first architecture. That said, buffering writes in local storage and retrying on failure is roughly twenty lines of code and costs nothing — worth having for the ordinary cases (a phone that slept mid-tap, a volunteer who wandered into a stairwell, a dead spot at the back of a lab, someone whose phone dropped to cellular). Treat it as normal error handling rather than as an architectural commitment. Everything beyond that is covered by the fallback tiers in Part 11.

### 0.4 Speed over completeness at the point of capture

The booth and the counters are the two places where a slow interface directly damages data quality — a volunteer facing a queue will stop recording before they'll slow down. Every capture interaction should be **one tap, no typing, no confirmation dialog**, with undo available afterwards. Anything that can't meet that bar belongs in a different screen used by an IC, not a volunteer.

### 0.5 Cards persist across days

Slide 54: Sec 4 students who don't finish on 6 Jan keep their stamps and return from 7 Jan. Card identity therefore has to survive across days and across devices. Card IDs are **pre-generated and printed at production time**, never generated at the booth.

---

## Part 1 — Volunteer App

The fix for "low-level volunteers didn't even know what the event was, just that they were a volunteer."

Opens to a **role-scoped home screen**. A DAAA facilitator and a Sign-Up Booth volunteer see entirely different first screens.

### 1.1 Universal, every volunteer

- **My shift** — station, time block, my IC, one-tap call and message
- **The visitor journey** — the six-step flow from slide 5 as a diagram, not a paragraph
- **Interactive floor map** — T19 by level: stations, Welcome Lounge, Mission Complete, toilets, AED locations per floor, first aid kit (SoC Administration Office), emergency exits, assembly points. Tapping a station shows its current IC.
- **My five things** — the slide 57 checklist, personalised by role
- **What do I say** — course one-liners for DCITP, DAAA, DCDF and DCS; what the Mission Card is; the "I don't know, let me get someone" escalation script
- **Escalation chain** — my IC → my Deputy Coordinator → Chief, with live contact
- **Alert button** — one tap, tagged with my station, routes to Safety IC and Chief

### 1.2 Role tiles

Below the universal block, only what that role actually uses: counter for ushers, registration for booth, scan for station facilitators, redemption for gift team, roster tools for ICs.

### 1.3 Onboarding

Volunteer opens a link or enters a join code, selects their name from the pre-loaded roster, done. **No password creation.** Account-creation friction on the morning of an event loses you a meaningful share of volunteers, and there's no sensitive visitor data behind the login to justify it.

### 1.4 Pre-event use

The app should be live from the **4 Nov 2026 Student Ambassador training** so volunteers arrive on 6 Jan already familiar with it. Push the milestone dates from slide 56 into it as a calendar.

---

## Part 2 — Sign-Up Booth / Registration

Designed for one tap per visitor. Slide 13 flags queue bottlenecks and double-counting as the two known failure modes.

### 2.1 Primary screen

Eight large buttons, matching slide 14 exactly:
Sec 1 · Sec 2 · Sec 3 · Sec 4 · Sec 5 · Graduated (awaiting results) · Parent/Guardian · Other

Tap = one registration, written immediately. Running session total displayed. Undo with a 10-second window. No submit button, no confirmation screen.

### 2.2 Group mode

A family arriving together is the case slide 5 calls out. Tap **Group**, build the composition (1× Sec 4, 2× Parent, 1× Other), confirm. That writes four registration records and issues **one** Mission Card linked to the group. This is how the family-of-four problem gets handled honestly rather than fudged into whichever number looks better.

### 2.3 Card issuing

Scan the pre-printed QR on the card to link it to the registration. Fallbacks in order: type the 6-character short code, or tap **issued without link**.

Critical: if the card link fails, the **registration count is still correct** — only that card's journey goes untracked. Never let an optional path block a mandatory one.

### 2.4 Anti-double-count

- Each device shows both its own session total and the booth-wide total, so two volunteers working the same queue can see the discrepancy
- Duplicate card scans within 60 seconds are flagged with a warning, not silently rejected
- A per-minute registration rate on the IC view — an implausible spike usually means someone is tapping to catch up rather than counting

### 2.5 Booth IC view

Live category breakdown, per-device contribution, hourly rate, and a manual adjustment field (with a required reason) for reconciling against a paper tally.

---

## Part 3 — Footfall Counters

The clicker replacement. Slide 28 lists the rooms requiring entry counts: Welcome Lounge, DAAA Station, DCDF Station, DCS Station, Mission Complete Area.

### 3.1 The screen

Room name, one very large **+** button, current count, small undo. Nothing else. It should be usable one-handed without looking.

### 3.2 Behaviour

- **Pre-assigned** per room per shift — the usher opens the app and it already knows they're on DCDF Station, 1.30–6pm
- **Increment-only with undo.** No history editing. Editable history is how tallies get "tidied up" into fiction.
- **Every tick timestamped**, which gives you peak-period analysis for free. Last year you received a WhatsApp saying "DCS: 120". This year you get the curve.
- **Multiple counters per room sum automatically**; the IC view shows which devices are contributing, so a counter who has stopped is visible
- **Idle nudge** — if a counter is open with no taps for 20 minutes during event hours, prompt the usher. Catches the phone that went into a pocket.
- **Manual entry path** for an IC to key in a physical clicker total at end of shift, tagged as `source: manual` so it stays distinguishable in the data

### 3.3 Physical clickers stay in the box

Not because the app will fail, but because they cost nothing, they're the natural fallback for a broken or flat phone, and having them present means a counter is never blocked.

---

## Part 4 — Mission Card Tracking

### 4.1 The physical card is not replaced

It's a keepsake, the character stamps are the point (slide 52), and it works when nothing else does. The system **mirrors** the card; it does not replace it. The physical stamp remains authoritative for gift redemption.

### 4.2 Flow

Card carries a printed QR plus a 6-character human-readable code. At each station the facilitator stamps physically, then scans. Recorded: card ID, station, timestamp, facilitator ID.

That gives you the funnel — of cards issued, how many reached the Welcome Lounge, each course station, and Mission Complete. This is the single richest dataset the event has never had.

### 4.3 Cases

- **Resume across days** — scanning a 6 Jan card on 8 Jan returns its existing stamps
- **Lost card** — IC-level permission (not volunteer) to reissue against the original ID, or issue fresh and void the old one
- **Damaged QR** — 6-character manual entry
- **Completion check at redemption** — scan shows stamp status instantly, but the physical card is still visually verified. The scan is a cross-check, not a gate.
- **Scanning unavailable** — stations stamp physically and carry on. You lose journey data for that window, not the event.

### 4.4 Card production requirement

The QR and short code must be on the card design **before it goes to print**. If the design isn't locked yet, this is the most time-sensitive dependency in the entire project.

---

## Part 5 — Gift Redemption & Inventory

- Redemption logged by scan or tap, with running stock count per gift type
- **Low-stock alert** at a configurable threshold, pushed to Deputy Coordinator (Course Counselling & Mission Complete) and the Chief. Slide 35 makes this an IC duty — automate it rather than relying on someone noticing.
- Duplicate-redemption warning if a card ID is presented twice
- Per-day, per-shift and per-station redemption breakdown for the post-event report
- Out-of-stock state renders a clear screen rather than a silent failure

---

## Part 6 — Roster, Shifts & Manpower

### 6.1 Core

- Shift assignment per volunteer: date, time block, station, role, reporting IC
- **Check-in / check-out** via QR at the volunteer desk. Gives Lead Facilitators live attendance (slide 21) instead of counting heads.
- **Swap requests** — volunteer proposes, IC approves, audit trail. Slide 54 asks briefers to arrange their own swaps; make it two taps.
- **Gap view** for the Chief: which stations are understaffed right now
- **Break tracking** for the Welfare IC — flags anyone on station 3+ hours without a break (slide 39)

### 6.2 Briefing wave roster

Slide 54: waves of 20 Sec 4 students every 30 minutes across 6–7 Jan, one briefer per wave, rotating through the Chief and all five Deputy Coordinators, ~5 minutes each.

- Dedicated roster view showing the full day's slots
- Prominent "you're up next" card with a 10-minute reminder push
- Swap flow between the six eligible briefers
- Checklist of the four mandatory brief points, visible during the slot

---

## Part 7 — Safety, Incidents & Lost Property

Three distinct flows with three different urgencies.

### 7.1 Incident report

Injury, illness, near-miss, safety concern. Structured form: type, location (pre-filled from the volunteer's station), severity, time, free-text description of **the event, not the people**. Optional photo of a hazard — never of a person.

Auto-notifies Safety IC, Deputy Coordinator (Welfare, Safety & Communications), and Chief. Immutable once submitted, with a separate append-only follow-up log. This produces the slide 43 incident report automatically rather than reconstructing it from memory a week later.

### 7.2 Lost and found

Item logged with photo, location found, time, current holder. Searchable list. Claim recorded at a designated counter. Status: held → claimed → unclaimed at close of event. Slide 48 lists lost-and-found cases as a tracked metric; this is the first time you'd actually have the number.

### 7.3 Lost person

The time-critical flow, and the highest-value single feature in the system.

Structured entry: approximate age, description, clothing, last seen where and when, reporting volunteer. Broadcasts immediately to every volunteer device with an **acknowledge** button, so the Safety IC can see live how much of the floor has been reached. A resolved/found action clears the alert everywhere.

Two deliberate constraints:

- The record is **transient** — it exists to coordinate a search, and is purged to an anonymised count once resolved. What goes in the post-event report is "3 lost-person cases, all resolved, median 7 minutes", not a description of a child.
- **Calling still beats tapping.** For a genuine emergency the standing instruction remains phone and voice. The app coordinates the search; it is not the emergency channel.

### 7.4 Relationship to the Safety Communications Chat

Slide 42 makes the WhatsApp Safety Communications Chat a formal Safety IC responsibility with a defined membership. **Do not retire it.** The app should feed into it — structured reports, better records, acknowledgement tracking — while WhatsApp and phone calls remain the human channel and the fallback. Adding a second safety channel that competes with the first is worse than having one.

---

## Part 8 — Broadcast & Comms

- **Targeted announcements** — all volunteers, one station, one role, one shift, or the IC layer only. "DCDF at capacity, ushers hold at Welcome Lounge."
- **Acknowledgement tracking** on critical messages
- **Quiet by default** — only safety and operationally urgent messages push. Everything else lands in an inbox. Volunteers who receive forty pushes stop reading pushes by 11am, and then the one that matters is the one they miss.
- **Pinned notices** for standing information (today's shift changes, station closures)

---

## Part 9 — Live Operations Dashboard

One screen for the Chief Coordinator, built for glancing at while walking.

- Registrations today by category, live
- Footfall per station, live, with a heat indicator for overcrowded and under-visited rooms (slides 25, 28)
- Cards issued → stamped → completed → gifts redeemed, as a funnel
- Open incidents, active lost-person alerts
- Volunteer check-in status by station, staffing gaps highlighted
- Gift stock levels
- **Data health** — any device that hasn't reported in 15+ minutes, and any station with zero counter activity during event hours. This is the early warning that a station has quietly stopped recording.

Deputy Coordinators get the same dashboard scoped to their portfolio. Add a **TV mode** for a display in the ops room.

---

## Part 10 — Post-Event Reporting

Everything the deck asks each IC to consolidate (slides 13, 28, 34, 43, 47, 48) — generated, not assembled.

- Registration profile by category, by day, by hour
- Footfall curves per station, peak periods, high- and low-traffic locations
- Mission Card funnel and completion rate, with cards-issued vs cards-completed split by day (important given returning visitors)
- Gift redemption statistics
- Incident log, near-miss log, lost-and-found outcomes, lost-person resolution times
- Volunteer hours, attendance, no-show rate
- Free-text observations submitted by ICs during the event, collated by portfolio
- One-click export to XLSX and PDF for the Lead (Comms & Outreach)

**Media archive** — photos and videos from the Communications IC into S3, with a tag browser by station, day and moment (slide 45). Keep this separate from the analytics system; it's an asset library, not a data system.

---

## Part 11 — Fallback System

The rule: **every capture function has a defined fallback, and the fallback is tested before it's needed.** A system that works 95% of the time with no fallback is worse than spreadsheets, because people trusted it.

### 11.1 Escalation tiers

| Tier  | Situation                                | Response                                                                                                   |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **0** | Normal                                   | App                                                                                                        |
| **1** | One volunteer's device fails             | Spare device from the station kit, or another volunteer on the same station covers                         |
| **2** | One station can't reach the backend      | Local buffer holds writes and retries automatically. Volunteer sees an "unsynced" badge but keeps working. |
| **3** | App or backend unavailable, network fine | **Google fallback pack** (§11.2)                                                                           |
| **4** | Total digital failure                    | **Paper pack** (§11.3)                                                                                     |

Escalation to Tier 3 or 4 is **declared by the Chief Coordinator or the relevant Deputy Coordinator only**, and announced through the Safety Communications Chat. Individual volunteers do not decide to switch systems — that's how you end up with the same visitor counted in three places.

### 11.2 The Google fallback pack

Built in advance, permissions set, links live, and **exercised at Dry Run #1**. Not created under pressure on the day.

**One Google Sheet per function**, in a shared Drive folder owned by the Chief with edit access for the relevant ICs:

| Sheet                     | Replaces | Structure                                                                                                        |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `FALLBACK_Registration`   | §2       | One row per tap: timestamp, category, device/volunteer, day. One tab per day.                                    |
| `FALLBACK_Footfall`       | §3       | One tab per room. Columns: 30-minute time block × counter name. Ushers enter block totals, not individual ticks. |
| `FALLBACK_MissionCard`    | §4       | Card short code, station, timestamp. Accepts partial data — a code alone is still useful.                        |
| `FALLBACK_GiftRedemption` | §5       | Card short code, gift type, timestamp. Plus a stock-remaining cell per type.                                     |
| `FALLBACK_Incidents`      | §7.1     | Timestamp, location, type, severity, description, reported by, follow-up                                         |
| `FALLBACK_LostAndFound`   | §7.2     | Item, found where, found when, holder, status                                                                    |
| `FALLBACK_Attendance`     | §6       | Volunteer, station, shift, check-in, check-out                                                                   |

**Google Forms** front the two high-frequency sheets (Registration, Footfall) so volunteers tap a radio button and submit rather than editing a shared spreadsheet — far fewer accidental overwrites, and it works cleanly on a phone. Forms write straight into the sheets above.

**Google Doc** — `FALLBACK_RunbookAndBriefing`: the floor map as images, AED and first aid locations, escalation contacts, the visitor journey diagram, the five things every volunteer must know. This is the Part 1 volunteer app content in a form that survives everything.

**Distribution**: every station kit contains a laminated card with QR codes to that station's fallback Form and the runbook Doc. Printed and placed at Dry Run #1, not on 6 Jan.

**Why Google rather than something better**: everyone already has an account, it needs no install, it works on any phone, multiple people can write at once, and it exports to CSV cleanly. It's the right tool for a fallback precisely because it's boring.

### 11.3 The paper pack

Sealed envelope per station, opened only on a Tier 4 declaration:

- Tally sheets — registration by category, footfall by 30-minute block
- Mission Card log (short code + station)
- Incident report forms
- Lost-and-found log
- Printed floor map with AED and first aid locations
- Contact card: Chief, all Deputy Coordinators, Safety IC, campus security, emergency numbers
- Physical clickers

Physical clickers are also present at Tier 0 as a per-device backup, independent of the tier system.

### 11.4 Reconciliation

Recovery matters as much as capture.

- Every fallback sheet has an **import path** into the main system, tagged `source: fallback_sheets` or `source: paper`
- Imported records keep their original timestamps where recorded, and a coarse time block where not
- The system tracks the **fallback window** — start and end of degraded operation — so reports can state plainly that footfall between 11:15 and 12:40 came from manual counts
- **Never silently blend sources.** A report that quietly mixes app data and paper estimates without saying so is worse than one that says "this hour is approximate."
- Reconciliation is a named post-event task with a named owner, done within 48 hours while people still remember

### 11.5 Testing the fallback

At **Dry Run #1 (18 Nov 2026)**, deliberately declare a Tier 3 and run one full station on the Google pack for 30 minutes. At **Dry Run #2 (4 Jan 2027)**, do the same for Tier 4 with paper. If the fallback has never been used before the day it's needed, it isn't a fallback.

---

## Part 12 — Edge cases

| Case                                            | Handling                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Two devices counting the same queue             | Per-device totals visible alongside booth total                                                  |
| Same card scanned twice at one station          | Warn, don't block — could be a legitimate re-scan after a correction                             |
| Card lost, visitor returns next day             | IC-level reissue against original ID, or fresh card with old one voided                          |
| Family of four, one card                        | Group registration writes 4 registration records, 1 card                                         |
| Visitor registers 6 Jan, returns 8 Jan          | New footfall entries; registration not re-counted. Documented in report footnotes.               |
| Phone battery dies                              | Power banks in every station kit; physical clicker as immediate cover; manual entry after        |
| Volunteer no-show                               | Gap surfaces on Chief dashboard; redeployment flow                                               |
| Gift stock exhausted                            | Alert fires before zero; redemption screen shows explicit out-of-stock state                     |
| Damaged or unreadable QR                        | 6-character manual code entry                                                                    |
| Duplicate records after a retry                 | Idempotency key per client-generated event ID                                                    |
| Volunteer loses phone or leaves early           | IC can revoke that device session                                                                |
| Nobody can log in on the morning                | Pre-generated printed join codes per station, distributed at Dry Run #2                          |
| A station stops recording and nobody notices    | Data-health panel on the Chief dashboard flags zero-activity stations                            |
| Volunteer taps registration rapidly to catch up | Per-minute rate anomaly flagged on the IC view                                                   |
| Counter left running after shift ends           | Auto-close at shift end, requires re-open                                                        |
| Sec 4 tour wave overlaps with public visitors   | Registration category distinguishes them; footfall does not — note this limitation in the report |

---

## Part 13 — Architecture

Your AWS instinct is right. Refinements:

**Frontend** — a PWA (React or equivalent), not a native app. No app-store review, no install friction, installable to home screen, runs on whatever phone a volunteer brings. Hosted static on **S3 + CloudFront**. Local write buffering via IndexedDB as ordinary error handling (§0.3).

**API** — **API Gateway + Lambda** rather than a persistent EC2 instance. Your load is four spiky days and 361 quiet ones; serverless matches that shape and keeps you inside free tier at this scale.

**Data** — **RDS Postgres** for everything. Roster, registrations, footfall ticks, card events, incidents, inventory. At your volume (tens of thousands of rows over four days) Postgres handles the append-heavy counter stream without difficulty. Resist adding DynamoDB alongside it; a second datastore is a second thing to debug at 10am on 7 Jan.

**Auth** — **Cognito** for staff, ICs, Deputy Coordinators and the Chief: real accounts, real permissions, real audit. For rank-and-file volunteers, Cognito's hosted signup is more friction than the threat model justifies — use join codes or magic links that provision a scoped identity behind the scenes.

**Media** — S3 with presigned upload URLs, lifecycle transition to Glacier after the event.

**Permissions** — mirror the deck's hierarchy exactly: Volunteer → IC → Deputy Coordinator → Chief → Lead (Comms & Outreach). Write access scoped to your own station; read access up the chain.

**Consider AWS Amplify.** It collapses auth, API, storage and hosting into something a student team can genuinely ship in four months. Worth an afternoon of evaluation before committing to hand-rolling the plumbing.

**Environments** — at minimum a staging environment separate from production, so the dry runs don't pollute real data and a bad deploy on 5 Jan doesn't take down the event.

---

## Part 14 — Build order

Dry Run #1 on **18 Nov 2026** is the real deadline. January is too late to discover something doesn't work.

**Must ship by 18 Nov**

1. Auth, roster, volunteer home screen and map
2. Registration (booth)
3. Footfall counters
4. Incident reporting and lost-person broadcast
5. Google fallback pack, built and tested

**Should ship by 4 Jan (Dry Run #2)** 6. Mission Card scanning and funnel 7. Gift inventory and redemption 8. Live ops dashboard 9. Broadcast and acknowledgements 10. Shift check-in and swap flow

**Nice to have — degrade gracefully to manual if they slip** 11. Lost and found 12. Media archive 13. Automated report generation 14. TV mode dashboard

**Fixed dependency:** the Mission Card QR and short code must be in the card design before print. Work backwards from the print deadline, not from the event date.

---

## Part 15 — Open questions

1. **Is the Mission Card design locked?** If not, getting a QR and short code onto it is the most time-critical item here.
2. **Who's on the dev team, and what can they already build?** Four months is comfortable for a small experienced team and tight for one person learning AWS concurrently.
3. **Own phones or shared devices?** Fixed stations (booth, redemption) benefit from a dedicated tablet on a stand; roaming roles are fine on personal phones.
4. **Who owns the AWS account after you graduate?** Worth deciding now if this is meant to be reused for SPOH 2028 rather than rebuilt.
5. **Does the school's IT need to approve deployment**, even with no personal data collected? Worth asking early — approval timelines are rarely short.
6. **Is footfall needed for the Sec 4 tour waves separately from public visitors?** Affects whether counters need a mode switch.
