# Consolidated backlog (P05.1)

Every open finding from the audits, deduplicated, ranked and given one home: the phase and step
that closes it. Written in P05.1 from `preliminary.md` and F01–F04. It is the worklist for P06–P16.
P15.1 closes it for security, and P16.7 hands whatever is left to normal issues.

- **Sources:** [`preliminary.md`](preliminary.md) (PF-01…20), [`F01`](F01-hardcoding.md) (47
  inventory items, 5 defects), [`F02`](F02-journeys.md) (32), [`F03`](F03-code-quality.md) (42),
  [`F04`](F04-security-ops.md) (25, the 7 actions, 33 account questions).
- **Check:** `node remediation/reports/P05/check-backlog.mjs` lists every finding ID in the five
  source files and exits 1 if one has no row here, or if a row has no home step that exists in
  `progress.json`.
- **Home** is the step that closes the finding. **Also** names steps that do part of the work, or
  that must not undo it. A finding closes when its home step lands the fix together with the test
  that proves it: the committed repro, un-skipped, where one exists.
- **Severity** follows [`README.md`](README.md). "High (to verify)" means the finding is High if
  the owner's answer to its P04.7 question confirms it. "for reuse" and "for the programme" (from
  `preliminary.md`) rank as the plain level here.
- **New steps added by this backlog:** P06.12, P06.13, P07.11 and P09.14. They are described in
  [Re-scoping](#re-scoping-p051-step-3) and are already in the phase files.

---

## Headline

**116 ranked rows, 108 unique open findings: 1 Blocker, 22 High, 52 Medium, 33 Low.** Also open:
the 7 owner actions F04 raised before the programme, 33 AWS account questions and 5 product
questions. 8 earlier findings are closed or merged.

| Source                | Filed | Closed or merged                                                 | Ranked rows |
| --------------------- | ----: | ---------------------------------------------------------------- | ----------: |
| `preliminary.md` (PF) |    20 | 4 fixed in P00 (PF-03, 15, 16, 19); 4 merged (PF-04, 05, 12, 20) |          12 |
| F01 defects           |     5 | —                                                                |           5 |
| F01 inventory         |    47 | not defects: [work items](#work-items-that-are-not-defects)      |           — |
| F02                   |    32 | —                                                                |          32 |
| F03                   |    42 | —                                                                |          42 |
| F04                   |    25 | —                                                                |          25 |
| **Total**             |   171 | 8                                                                |     **116** |

The 116 rows include 8 that restate or group other rows (PF-06, PF-07, PF-08, PF-09, PF-10,
F01-047, F02-020, F03-042). They keep their own row so that every ID has a home, and are marked
_umbrella_ or _see_ in **Also**. The other **108** are the unique open findings.

| Severity | Rows | Unique | Earliest home           |
| -------- | ---: | -----: | ----------------------- |
| Blocker  |    1 |      1 | P09.1                   |
| High     |   25 |     22 | P06.12 (8 of them)      |
| Medium   |   54 |     52 | P06.12 (2), P06.13 (14) |
| Low      |   36 |     33 | P06.13 (16)             |

**What the backlog says**

1. **The event can run on the new platform only if the core lands on time.** The one Blocker
   (F02-001, no event entity) and the High "reuse" items (taxonomy, timezone, content) are the
   P09–P13 core. D-01 C puts the go/no-go on 28 Oct.
2. **Ten defects change what the committee reads, who can do what, or whether a tap is counted, on
   the code running today.**
   Examples: a Deputy can make themselves an Admin through the roster import (F03-001), today's
   dashboard counts future-dated rows (F02-006), paper tallies merge on import (F03-012), and
   queued taps are parked for good (F03-033). Whatever D-01 C decides on 28 Oct, January runs one
   of the two code lines, so these are fixed **first**, on the unrefactored code, where they can be
   carried to the fallback line (new step **P06.12**,
   [January safety net](#january-safety-net-p0612)).
3. **The next biggest risk is operability, not code.** Nothing pages a human (F04-017), off-site
   backups are unproven (F04-018), one small box runs everything (F04-019), and a room of people
   cannot sign in at once (F04-006). The first three have owner actions due before training and
   Dry Run #1. The fourth needs a configuration change on the deployed box before 4 Nov.
4. **About 30 correctness bugs sit in P06, which was "no behaviour change".** They now have their
   own step (P06.13), with one labelled `fix` commit per bug, so the refactor diff stays a pure move.
5. **The admin experience is P13/P14's job and is large.** 42 of 95 routes have no screen (PF-09),
   and nothing links to anything (F02-029).

---

## Owner actions before the programme

The seven actions from F04 § Summary. They concern the **running deployment**, which D-13 keeps
out of this programme's reach, so only the owner can do them. None of them waits for G1. Each has
a deadline set by the event calendar.

| #   | Action                                                                                                                                  | By                                      | Closes or confirms       | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------ | ------ |
| A1  | Answer Q-S2 (Block Public Access on the account and every bucket) and Q-R1 (root MFA, no root keys).                                    | **now**: an emergency if either is "no" | public-bucket check, P15 | open   |
| A2  | Confirm dumps land in the backup bucket (Q-I3) and snapshots exist (Q-L2). If not, fix it and restore one dump into a scratch database. | **now**                                 | F04-018                  | open   |
| A3  | Raise the sign-in rate limit on the deployed box, or give `/auth/login` and `/auth/callback` their own limit.                           | **before 4 Nov training**               | F04-006 (interim)        | open   |
| A4  | Check Cognito's email sender and temporary-password validity (Q-C6, Q-C7).                                                              | **before bulk invites**                 | F04-023 (interim)        | open   |
| A5  | An external uptime check on `/readyz` plus the backup staleness check, both alerting a phone.                                           | **before Dry Run #1 (18 Nov)**          | F04-017 (interim)        | open   |
| A6  | Restrict the IAM key to the box's IP, rotate it, and record its age.                                                                    | **before 4 Nov training**               | F04-010 (interim)        | open   |
| A7  | If the DuckDNS updater is installed, remove `curl -k`.                                                                                  | **now** (one flag)                      | F04-012 (interim)        | open   |

A3 and A5 fix the deployed box, not `main`. If the owner wants them as code on the fallback line,
P06.12 carries A3's rate-limit change as a commit. A5 is monitoring outside the app.

---

## Owner questions still open

### AWS account and ownership (F04 § P04.7): 33 questions, none answered

Skipped under D-13, so nothing below comes from the account. The questions, their console paths
and "repo says" facts are in F04 § P04.7. Their answers confirm or close the "to verify" findings.

| Group                             | Questions                          | Answer first              | Confirms or closes                    |
| --------------------------------- | ---------------------------------- | ------------------------- | ------------------------------------- |
| Account ownership and root        | Q-R1, Q-R2                         | **Q-R1**                  | P15, handover (P16)                   |
| S3                                | Q-S1, Q-S2, Q-S3, Q-S4             | **Q-S2**                  | public-bucket check, F04-013, F04-014 |
| IAM                               | Q-I1…Q-I5                          | Q-I3 (backups), Q-I1      | F04-010, F04-018, P08                 |
| Cognito                           | Q-C1…Q-C9                          | Q-C6, Q-C7 (invites)      | F04-001, F04-002, F04-023             |
| Lightsail                         | Q-L1, Q-L2, Q-L3                   | Q-L2 (snapshots)          | F04-018, F04-019, threat model B5     |
| CloudWatch, CloudTrail, detection | Q-W1, Q-W2, Q-A1, Q-A2, Q-G1, Q-G2 | Q-W2 (does anything page) | F04-015, F04-017, F04-010, P15.6      |
| Cost                              | Q-B1                               | —                         | D-10, P08                             |
| Outside AWS                       | Q-H1, Q-H2, Q-D1                   | Q-D1 (data regime)        | F04-011, F04-012, F04-014, F04-016    |

P05 designs on the assumption that the answers are the safe ones (Block Public Access on, root MFA
on, and so on). ADR-008 and ADR-006 say where an unsafe answer would change the design.

### Product questions (F01 § Summary, and new in P05)

P05 decides each of these on its recommendation. Each is marked **assumed** in the ADR that uses
it and is on the P05.11 walkthrough list.

| #    | Question                                                                                                                           | P05 assumes                                                                                                                                | ADR     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Q-P1 | D-04 follow-up: what may a merged count show, and which visitor personal data may an event collect, kept how long, seen by whom?   | a merged total is shown only beside the three counts, never instead of them; PII fields are an allowlist per event with a retention period | ADR-002 |
| Q-P2 | Will any event run past midnight?                                                                                                  | yes: shifts may end on the next day, and each event has a day-boundary hour (default 04:00)                                                | ADR-004 |
| Q-P3 | Is product vocabulary ("Mission Card") renameable per event?                                                                       | yes, through event settings for a short list of labels; routes and code keep the platform terms                                            | ADR-003 |
| Q-P4 | One locale for every event, or per organisation or event?                                                                          | per event, defaulting to the organisation's locale (`en-SG` for SP)                                                                        | ADR-003 |
| Q-P5 | D-01 C's fallback needs somewhere to put fixes for the deployed line. D-11 forbids branches. May a `release/january` branch exist? | yes, one exception to D-11, cut from the deployed commit and holding only P06.12 cherry-picks                                              | ADR-009 |

Decisions D-07, D-08 and D-12 are also still open. P05 proceeds on their recommendations (see
`DECISIONS.md`).

---

## January safety net (P06.12)

Under D-01 C, January runs either the new platform (go on 28 Oct) or the deployed line plus
critical fixes (no-go). A fix written after P06 has moved the code cannot be cherry-picked onto
the old line. So P06.12 runs **first in P06**, on the unrefactored code: each fix is one commit,
test first, un-skipping its P03/P04 repro, and cherry-pickable onto the deployed line. The
deployed line is the audit branch, `319d06d`. It already fixes F03-001's import path, F02-002 and
F03-025 (F03 § P03.9), so each of those commits records whether it applies there.

| Finding | Why it is on the list                                                                    | Side   |
| ------- | ---------------------------------------------------------------------------------------- | ------ |
| F03-001 | privilege escalation through roster import and provisioning                              | server |
| F02-002 | the roster import preview fails with two new people                                      | server |
| F02-006 | today's dashboard and TV count future-dated rows                                         | server |
| F02-027 | the report counts future shifts as no-shows                                              | server |
| F03-012 | the fallback import merges separate paper tallies                                        | server |
| F04-013 | lost-person descriptions survive the purge in the replay store                           | server |
| F04-006 | sign-in limit: `/auth/login` and `/auth/callback` get their own limit, keyed on failures | server |
| F03-033 | the outbox parks retryable captures for good                                             | client |
| F04-003 | a queued capture is sent under whoever signs in next on the phone                        | client |
| F01-046 | shift labels ignore the configured hours (dry runs move them)                            | client |

Output: `reports/P06/january-fixes.md`, with one row per fix (commit on `main`, applies to
`319d06d`: yes or no or conflict, test). Where these commits land on the deployed line is Q-P5.

---

## Ranked backlog

Order: severity, then how soon the home step runs. "P06.12 → P11.2" means the home closes the
immediate defect and the later step makes it structural.

### Blocker

| ID      | Title                                            | Home  | Also                              | Status |
| ------- | ------------------------------------------------ | ----- | --------------------------------- | ------ |
| F02-001 | There is no way to create or hold a second event | P09.1 | P09.9, P13.2, P13.8; merges PF-04 | open   |

### High

| ID      | Title                                                                                      | Home   | Also                                                             | Status |
| ------- | ------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------- | ------ |
| F03-001 | Roster import and provisioning can grant any role, including Admin                         | P06.12 | P11.2 (guardrail `forbid`), P12.3                                | open   |
| F02-006 | Future-dated records count in today's dashboard                                            | P06.12 | P09.4 (import validation)                                        | open   |
| F02-027 | No-shows count shifts that have not happened yet                                           | P06.12 | P09.12                                                           | open   |
| F03-012 | The fallback import merges separate paper tallies                                          | P06.12 | P06.8                                                            | open   |
| F02-002 | Roster import dry run fails with 500 when the file has two or more new people              | P06.12 | P06.7 (plan/apply), P12.4                                        | open   |
| F04-013 | Lost-person descriptions outlive the promised purge                                        | P06.12 | P08.7 (backup lifecycle), P15.7; rule in ADR-003                 | open   |
| F04-006 | One campus network can sign in only about ten people a minute                              | P06.12 | owner action A3; P15.2                                           | open   |
| F03-033 | The outbox parks retryable captures for good                                               | P06.12 | P07.11 (tests move with the outbox split)                        | open   |
| F04-017 | Nothing pages a human                                                                      | P08.8  | owner action A5; P16.3                                           | open   |
| F04-018 | Off-site backups are unproven on the deployed host; restore never rehearsed (to verify)    | P08.3  | owner action A2; P16.4                                           | open   |
| F04-019 | Everything runs on one small box that cannot serve the event                               | P08.4  | ADR-008; P15.8 (cutover)                                         | open   |
| F04-010 | The app authenticates to AWS with a long-lived IAM user key (merges PF-12)                 | P08.6  | owner action A6; P15.6                                           | open   |
| F04-002 | Cognito pool security settings unrecorded; runbook's client update resets them (to verify) | P12.1  | Q-C1…Q-C9; P08.6                                                 | open   |
| F04-023 | Invites may hit Cognito's email quota and expire before training (to verify)               | P12.2  | owner action A4; D-08                                            | open   |
| F02-004 | Taxonomy cannot change without a migration                                                 | P09.2  | P09.10; merges PF-05                                             | open   |
| PF-06   | Singapore time hardcoded                                                                   | P09.6  | _umbrella_ of F01-023…028 and F03-013                            | open   |
| PF-08   | Event content compiled into the client                                                     | P13.3  | P13.4 (offline); _umbrella_ of F01-005, 007, 010, 012, 013       | open   |
| PF-01   | Per-process caches are stale across instances                                              | P10.3  | F03-009, F03-030                                                 | open   |
| PF-02   | Rate limiter uses the default in-memory store                                              | P15.2  | F04-006, F03-042                                                 | open   |
| F02-003 | Setup entities have endpoints but no screens                                               | P13.3  | P13.2                                                            | open   |
| F02-013 | Corrections (void, stock adjust, card reissue) have no screen                              | P13.7  | P13.3 (cards), P14.2                                             | open   |
| F02-015 | Incidents cannot be seen or worked after they are reported                                 | P13.7  | P14.1                                                            | open   |
| PF-09   | Server features with no screen (42 of 95 routes)                                           | P13.7  | _umbrella_ of F02-003, 013, 014, 015, 023, 024                   | open   |
| F02-029 | No entity has its own page, and nothing links to anything                                  | P14.1  | P14.2, P14.3                                                     | open   |
| PF-14   | The deployed system is not the baseline code                                               | P05.10 | _decided_: D-05 follow-up (mine, do not merge); F04-020; ADR-009 | open   |

### Medium

| ID      | Title                                                                           | Home   | Also                                                          | Status |
| ------- | ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- | ------ |
| F04-003 | A queued capture is sent under whoever signs in next on that phone              | P06.12 | P07.11                                                        | open   |
| F01-046 | Shift labels ignore the configured shift hours                                  | P06.12 | P09.2 (templates replace the setting)                         | open   |
| F03-002 | Unique-constraint violations are answered with 500                              | P06.13 | P06.2                                                         | open   |
| F03-003 | A reissued card can be given a second gift with no warning                      | P06.13 | P06.5                                                         | open   |
| F03-004 | Linking a group to a completed card resets it to ISSUED                         | P06.13 | P06.5                                                         | open   |
| F03-005 | Approving a stale swap request moves someone else's shift                       | P06.13 | P06.7                                                         | open   |
| F03-006 | Two decisions on one swap both apply                                            | P06.13 | P06.7                                                         | open   |
| F03-007 | Simultaneous redemptions oversell stock and give one card several gifts         | P06.13 | P06.5                                                         | open   |
| F03-008 | Simultaneous stamps of one card at one station fail with 500                    | P06.13 | P06.5                                                         | open   |
| F03-009 | Revoking a session leaves its access token working for up to a minute           | P06.13 | P10.3 (cross-instance)                                        | open   |
| F03-014 | An urgent announcement is pushed to people it does not reach                    | P06.13 | P14.4 (composer copy)                                         | open   |
| F03-018 | Audit rows are missing, mislabelled or lack a "before"                          | P06.13 | P11.1 (generated action catalogue)                            | open   |
| F03-019 | Relation loads run concurrently on a transaction connection (merges PF-20)      | P06.13 | P06.7                                                         | open   |
| F03-028 | A reissued journey is counted twice, and the original as voided                 | P06.13 | rule confirmed in ADR-002                                     | open   |
| F03-031 | Every worker runs the lost-person purge, so summaries are written twice         | P06.13 | P10.7 (scheduler)                                             | open   |
| F04-004 | An IC can read any station's roster, phone numbers included                     | P06.13 | P11.2 (station-scoped reads)                                  | open   |
| PF-10   | Layering is conventional, not enforced                                          | P06.10 | P06.3–P06.9, P07.9; _umbrella_ of the F03 module map          | open   |
| PF-18   | Coverage thresholds exist but were never enforced                               | P08.9  | P06.1, P07.1 (no drop); gate set in ADR-007                   | open   |
| F02-011 | The IC console repeats people per block and forgets the IC's station            | P07.11 | P14.1 (defaults, grouping)                                    | open   |
| F03-032 | Runtime settings load once per page load, and not after an in-app sign-in       | P07.11 | P10.8 (live updates)                                          | open   |
| F03-034 | Stamps, redemptions, incidents and lost-person alerts are online-only           | P07.11 | decided in ADR-007                                            | open   |
| F03-036 | The capture screens are not precached                                           | P07.11 | P13.4                                                         | open   |
| PF-17   | CI does not run the e2e suite                                                   | P08.9  | —                                                             | open   |
| F04-015 | The audit log can be edited, and its retention shortened, by the app            | P08.3  | P08.8 (log group), P15.7                                      | open   |
| F04-011 | Every secret is a plaintext line on one box, with no owner or rotation          | P08.6  | P06.7 (`sid`↔`sub`), P15.6, P16.5                             | open   |
| F04-012 | The DuckDNS updater sends its token with `curl -k`                              | P08.5  | owner action A7 (interim)                                     | open   |
| F04-020 | Deploys build on the production box; rollback is a rebuild; runbooks off `main` | P08.9  | PF-14                                                         | open   |
| F03-039 | Audit events reach CloudWatch before their transaction commits (audit branch)   | P08.8  | ADR-003 (post-commit shipping) if the branch's code is reused | open   |
| F03-040 | One rejected batch stops CloudWatch delivery for good (audit branch)            | P08.8  | the log agent replaces hand shipping (ADR-008)                | open   |
| PF-07   | Operational settings in env                                                     | P10.4  | _umbrella_ of F02-017 and the F01 env audit                   | open   |
| F02-017 | Attendance is dead until an env var is set and the server restarted             | P10.4  | P13.3 (attendance setup)                                      | open   |
| F03-030 | A settings change reaches other instances up to a minute later                  | P10.3  | —                                                             | open   |
| F04-014 | Nothing but lost-person fields has a retention period                           | P10.7  | P15.7; schedule in ADR-003                                    | open   |
| F04-016 | No data-classification model for events that turn PII on (D-04)                 | P09.14 | P13.3; model in ADR-002                                       | open   |
| F02-025 | Screens a role cannot use open anyway and fail on submit                        | P11.8  | P11.7                                                         | open   |
| F02-030 | Denials are reported as outages, network faults or endless loading              | P11.8  | P14.4                                                         | open   |
| F02-031 | The Deputy is told they cannot edit the roster, which the server allows         | P11.7  | P13.5                                                         | open   |
| F03-010 | Concurrent refreshes fork a session family                                      | P12.5  | F02-032                                                       | open   |
| F02-032 | Two tabs refreshing at once sign the person out everywhere                      | P12.5  | F03-010                                                       | open   |
| F04-001 | Raw Cognito access tokens are accepted and skip revocation                      | P12.5  | F03-009                                                       | open   |
| F02-008 | Staffing gaps omit the shift block and cannot be acted on                       | P13.5  | P14.1                                                         | open   |
| F02-014 | Volunteers cannot request or withdraw a swap                                    | P13.7  | P13.5 (swap queue)                                            | open   |
| F02-023 | Briefing slots have no screen, so the mandatory brief points are never shown    | P13.5  | P13.3 (content)                                               | open   |
| F02-024 | The audit log has no screen                                                     | P13.7  | reuse of the audit-branch screen (D-05 follow-up)             | open   |
| F02-007 | The live dashboard does not drill down                                          | P14.2  | P14.1                                                         | open   |
| F02-012 | Imported fallback rows appear as a person's device taps                         | P14.2  | P09.12 (provenance)                                           | open   |
| F02-028 | Lost-person outcomes are invisible until the purge runs                         | P14.2  | —                                                             | open   |
| F02-009 | An announcement with no audience chosen goes to the whole event                 | P14.4  | —                                                             | open   |
| F02-016 | Lost-person alerts stack above the app on phones                                | P14.4  | —                                                             | open   |
| F02-022 | A parked capture can be copied but never cleared                                | P14.4  | P07.11 (outbox)                                               | open   |
| F02-019 | A swap decision changes someone's shifts without telling them                   | P14.5  | remapped from P14.3: the notification centre owns it          | open   |
| F04-007 | Production CSP allows inline script; an XSS would own the session               | P15.3  | —                                                             | open   |
| F04-021 | Capacity measured for captures on a laptop, not the event's mix on its server   | P16.2  | P08.10 (staging at target size)                               | open   |
| PF-11   | Documentation drift                                                             | P16.5  | ADR-007 (the missing brief and build plan)                    | open   |

### Low

| ID      | Title                                                                     | Home   | Also                                         | Status |
| ------- | ------------------------------------------------------------------------- | ------ | -------------------------------------------- | ------ |
| F03-011 | Two retries can both take over an abandoned idempotency key               | P06.13 | P06.2                                        | open   |
| F03-015 | A second check-out overwrites the first                                   | P06.13 | P06.7                                        | open   |
| F03-016 | Briefing-slot completion rules are inverted                               | P06.13 | P11.2                                        | open   |
| F03-017 | Pagination cursors do not end, and can skip or repeat                     | P06.13 | P06.2 (one cursor helper)                    | open   |
| F03-020 | Card-code input disagrees with the printed alphabet                       | P06.13 | P07.11                                       | open   |
| F03-022 | A card batch can print a code that belongs to another card                | P06.13 | P06.5                                        | open   |
| F03-023 | Long-shift warnings include shifts from earlier days                      | P06.13 | P06.7                                        | open   |
| F03-024 | Incident status moves freely, including back from RESOLVED                | P06.13 | P13.7                                        | open   |
| F03-025 | Import counters count a new person twice                                  | P06.13 | P06.7                                        | open   |
| F03-026 | Rule failures are reported as permission denials                          | P06.13 | P11.8                                        | open   |
| F03-027 | A voided or unissued card can be reissued                                 | P06.13 | P06.5                                        | open   |
| F03-029 | Record mappers query per row (N+1) on polled lists                        | P06.13 | P06.5, P06.6, P06.8                          | open   |
| F04-005 | Acknowledging an announcement returns it to people outside its audience   | P06.13 | P06.8                                        | open   |
| F04-024 | An IC can send an urgent announcement to any station                      | P06.13 | P11.2                                        | open   |
| F04-008 | Six routes unthrottled; `/readyz` queries the database for anyone         | P06.13 | P08.4 (health checks behind the ALB)         | open   |
| F04-025 | A push endpoint can be any URL                                            | P06.13 | P15.3 (egress)                               | open   |
| F01-051 | `server/.env.example` omits nine keys, one of them required in production | P06.9  | P08.6                                        | open   |
| F02-010 | Every page load sends a settings request before the session is ready      | P07.11 | —                                            | open   |
| F02-020 | Screens call endpoints their role may not use                             | P07.11 | P11.8; _see_ F02-025                         | open   |
| F03-035 | A replaced push subscription is never sent to the server                  | P07.11 | —                                            | open   |
| F03-037 | Every route ships the shared schemas; two dependencies are unused         | P07.11 | P07.8                                        | open   |
| F03-038 | `AttendanceMethod` is missing from the shared enums                       | P07.8  | —                                            | open   |
| PF-13   | Client `next.config.ts` has no `output: 'standalone'`                     | P08.4  | —                                            | open   |
| F04-022 | No automated dependency updates; upgrade pins undocumented                | P08.9  | P15.9                                        | open   |
| F01-047 | The `eventName` setting is never displayed                                | P09.1  | P14.6; _see_ F01-002                         | open   |
| F01-050 | The server does not enforce which stations register visitors or redeem    | P09.5  | capability flags (ADR-002)                   | open   |
| F03-013 | "Today" starts at 08:00 local time                                        | P09.6  | day-boundary hour (Q-P2)                     | open   |
| F02-026 | The CSV export is written for machines, not for the report's readers      | P09.12 | P13.8 (export pack); remapped from P14.5     | open   |
| F01-052 | `alertPollSeconds` accepts values that break the alert guarantee          | P10.1  | —                                            | open   |
| F02-021 | The undo copy hardcodes ten seconds                                       | P10.1  | —                                            | open   |
| F03-021 | Resetting a setting is not atomic with its audit row                      | P10.2  | —                                            | open   |
| F02-005 | Saving settings marks every field as "changed from default"               | P10.8  | —                                            | open   |
| F04-009 | The PIN fallback lets someone mark attendance from anywhere               | P10.4  | event setting (ADR-003); P13.3               | open   |
| F03-041 | The audit log's live tail can skip rows (audit branch)                    | P13.7  | only if the branch's screen is reused        | open   |
| F02-018 | My shift lists every assignment ever, in one flat list                    | P14.1  | remapped from P14.3: the person page owns it | open   |
| F03-042 | Security-event dedupe is per worker (audit branch)                        | P15.2  | _see_ PF-02                                  | open   |

### Closed before P05

| ID    | Title                                           | How                                |
| ----- | ----------------------------------------------- | ---------------------------------- |
| PF-03 | Lint is red on `main`                           | fixed in P00.4                     |
| PF-15 | e2e test drifted from the home screen           | fixed on `main` (`7eea32d`)        |
| PF-16 | At 320 px, content covers the bottom navigation | fixed on `main` (`4269c77`)        |
| PF-19 | CI's dependency audit fails on the baseline     | fixed on `main` (`e8e94fb`)        |
| PF-04 | No Event entity                                 | merged into F02-001                |
| PF-05 | Event taxonomy is enums                         | merged into F02-004                |
| PF-12 | Long-lived IAM user keys on the host            | merged into F04-010                |
| PF-20 | Test harness rough edges                        | remaining item merged into F03-019 |

---

## Work items that are not defects

These are the audits' inventories. They are the specification of the phase that builds the
target, not bugs, so they are grouped here rather than ranked.

### F01 inventory (every hardcoded value, with its class)

| Items                                       | Class                  | Home   | Also                              |
| ------------------------------------------- | ---------------------- | ------ | --------------------------------- |
| F01-001, F01-002, F01-006                   | `event-data`           | P09.1  | P14.6, P09.12                     |
| F01-003                                     | `platform-setting`     | P09.1  | P14.6 (on `Organisation`)         |
| F01-004                                     | `platform-setting`     | P14.6  | —                                 |
| F01-014                                     | `event-data`           | P09.4  | P13.3                             |
| F01-015, F01-018, F01-019, F01-020, F01-045 | `event-data`           | P09.2  | P09.11, P10.1                     |
| F01-023, F01-024, F01-025, F01-026, F01-027 | `event-data` (time)    | P09.6  | P09.8; T-01…T-16                  |
| F01-028                                     | `event-data` (time)    | P08.3  | backups move to AWS Backup        |
| F01-008, F01-010, F01-012, F01-013          | `event-content`        | P13.3  | P13.4                             |
| F01-005                                     | `event-content`        | P13.4  | P14.6                             |
| F01-007                                     | `event-content`        | P14.8  | —                                 |
| F01-009, F01-037                            | `event-setting`        | P10.4  | P13.3                             |
| F01-039                                     | `event-setting`        | P10.1  | —                                 |
| F01-038                                     | `platform-setting`     | P10.1  | —                                 |
| F01-048, F01-049                            | `event-setting` (D-04) | P09.14 | ADR-002                           |
| F01-029, F01-030, F01-031, F01-032, F01-033 | `infra-config`         | P08.6  | P08.1, P08.3, P08.7, P12.1, P12.5 |
| F01-021                                     | `invariant` (D-03 A)   | P11.2  | P11.5                             |
| F01-022                                     | `invariant`            | P07.8  | stays an enum (`invariants/`)     |
| F01-011                                     | `fixture`              | P14.8  | —                                 |
| F01-016, F01-017, F01-043                   | `fixture`              | P09.11 | P09.6                             |
| F01-034, F01-042                            | `fixture`              | P09.11 | stay as they are (dev only)       |
| F01-044                                     | `fixture`              | P16.2  | —                                 |
| F01-035, F01-036, F01-040, F01-041          | `legit-constant`       | P07.8  | stay; F01-036 is printed on cards |

The env audit (34 server + 5 client keys) is P10.4's worklist, and the settings audit (16 keys
plus 13 proposed) is P10.1's. The content audit is P13.3's. The time audit (T-01…T-16 and 12 DST
cases) is P09.6's.

### Other inventories

| Inventory                                                   | Where                    | Home                        |
| ----------------------------------------------------------- | ------------------------ | --------------------------- |
| 97 long functions and 18 long files, each with a split plan | F03 § P03.2, Appendix B  | P06.3–P06.9, P07.5          |
| 359 exports with a target module                            | F03 Appendix A           | P06.2–P06.9, P07.2–P07.8    |
| 12 "one way to do it" patterns                              | F03 § P03.3              | P06.2, P07.2, P07.6         |
| 11 ranked test gaps (hosted sign-in, capture, corrections)  | F03 § P03.6              | P06.1, P07.1                |
| 7 duplicated contracts, 3 generated artefacts               | F03 § P03.8              | P07.8, P10.1, P11.1         |
| 7 close-out and clone requirements                          | F02 § Journey 6          | P09.9, P13.8                |
| Interlinking matrix (16 entities)                           | F02 § P02.8              | P14.1–P14.3                 |
| Per-role permission table and matrix oddities               | F02 § P02.9, F03 § P03.1 | P11.3 (`CHANGES.md`), P11.7 |
| 12 authorization rules made outside middleware              | F04 § P04.3              | P11.2, P11.5                |
| Event scoping enforced below the handlers                   | F04 § P04.3              | P09.5 (ADR-001)             |
| 14 ranked risks from the threat model                       | F04 § P04.1              | P15.9 (re-checked)          |

---

## Re-scoping (P05.1 step 3)

What the audits showed that the plan did not have. Each change is made in the phase file, and
`progress.mjs sync` has picked it up.

| Phase | Change                                                                                                                                                                                                                                                 | Why                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| P06   | **New P06.12, Critical fixes first (January safety net)**, placed first in the file. "Changes behaviour" becomes "only in labelled `fix` commits".                                                                                                     | D-01 C: the fallback line needs the fixes, and they cannot be cherry-picked once code has moved. |
| P06   | **New P06.13, Correctness fixes**: the remaining server bugs from F03/F04, one `fix` commit each with its repro, landed right after the module's refactor step.                                                                                        | F03 homes about 30 bugs in P06; its context said bugs were not fixed there.                      |
| P07   | **New P07.11, Client correctness fixes**: F02-010, F02-011, F02-020, F03-032, F03-034 (per ADR-007), F03-035, F03-036, F03-037, F03-020.                                                                                                               | the client bugs had no step.                                                                     |
| P08   | P08.3 adds the database roles (the app cannot update or delete audit rows, F04-015). P08.9 adds e2e in CI (PF-17), the coverage gate (PF-18), Dependabot (F04-022) and image-based rollback (F04-020). P08.10 prices from the public Price List files. | findings with no step; D-13 rules out the Pricing API                                            |
| P09   | **New P09.14, Per-event product rules (D-04)**: the count-merge and visitor-PII options with a data classification. The context no longer calls the two rules invariants.                                                                              | D-04 made them options after the plan was written; F04-016 and F01-048/049 had no step.          |
| P15   | P15.6 no longer says "if P04.7 found them off" (P04.7 was skipped). It now says "per the owner's answers to the P04.7 questions".                                                                                                                      | P04.7 became questions under D-13.                                                               |

The ADR steps P05.2–P05.10 make further edits where a decision changes a step. Those edits are
recorded in each ADR's _Migration_ section.
