# P01 — Audit A: hardcoding and configuration inventory

| Field             | Value      |
| ----------------- | ---------- |
| Gate              | G0         |
| Depends on        | P00        |
| Decisions         | D-02, D-04 |
| Changes behaviour | No         |
| Size              | M          |

## Purpose

Find **every** value that ties the system to SPOH 2027, to Singapore, to one venue or to one
deployment. Decide where each belongs. The output drives P09 (event model), P10 (live config),
P13 (content) and P15 (secrets).

## Context for a fresh session

- Headline findings are already in `baseline.md` § _Hardcoding_ and `findings/preliminary.md`
  PF-04…PF-08. This phase makes the list exhaustive and classifies each item.
- Output file: `findings/F01-hardcoding.md`.

## Classification

Every hit gets exactly one class and a target home:

| Class              | Meaning                                                 | Target home                             |
| ------------------ | ------------------------------------------------------- | --------------------------------------- |
| `event-data`       | an entity an event creates (days, stations, categories) | database rows, admin CRUD (P09/P13)     |
| `event-setting`    | a tunable per event (thresholds, poll rates, root)      | settings registry, event scope (P10)    |
| `station-setting`  | a tunable per station                                   | settings registry, station scope (P10)  |
| `platform-setting` | a tunable for the whole deployment                      | settings registry, platform scope (P10) |
| `event-content`    | text or images volunteers read                          | ContentDocument plus S3 (P13)           |
| `infra-config`     | where things run (URLs, IDs, region)                    | SSM Parameter Store / env (P08)         |
| `secret`           | keys, passwords                                         | Secrets Manager (P08)                   |
| `invariant`        | a product rule true for every event (D-04)              | stays in code, documented               |
| `fixture`          | test or dev data                                        | tests/fixtures or dev seed only         |
| `legit-constant`   | a physical or protocol constant                         | stays, named                            |

## Steps

### P01.1 — Automated sweep

- **Do:** Run and save the raw output of pattern searches over `server/`, `client/`,
  `packages/`, `infra/`, `ops/`, `scripts/`, `prisma/seed.ts`, `public/`:
  - ISO dates and years (`20\d\d-\d\d-\d\d`, `202[6-9]`), wall-clock times (`\b\d{1,2}:\d{2}\b`)
  - timezone markers (`Asia/Singapore`, `SGT`, `+08`, `8 * 60`)
  - venue and brand (`SPOH`, `T19`, `School of Computing`, `Open House`, `SP `)
  - course codes (`DAAA|DCDF|DCS|DCITP`)
  - enum members (every value of every Prisma enum) used as literals outside the enum definition
  - domains, URLs and emails (`duckdns`, `@spoh2027`, `https?://`)
  - magic numbers in services (`\b\d{2,}\b` in `modules/**` excluding tests), reviewed by eye
- **Covers:** nothing is missed because it was not already known.
- **Done when:** the raw hits are saved under `reports/P01/` with the commands used.

### P01.2 — Classify every hit

- **Do:** Build the table in `F01-hardcoding.md` with columns: id, file:line, literal, meaning,
  class, target home, phase/step. Group duplicates.
- **Done when:** every raw hit is either classified or marked as a false positive.

### P01.3 — Enum audit

- **Do:** For every Prisma enum and every enum in `packages/shared/src/enums.ts`, decide
  `invariant` vs `event-data`. Record which code branches on each value; those branches become
  capability flags when the enum becomes data. Examples: `StationKind.SIGNUP_BOOTH` enables
  registration; `issuesStamp` and `countsEntry` are already flags.
- **Covers:** the P09.2 migration design (enum → table plus flags).
- **Done when:** each enum has a verdict and a list of dependent branches.

### P01.4 — Env audit

- **Do:** For each key in `server/src/config/env.ts` and `client/.env.example`, record:
  - its purpose, default and production guard
  - its class: infra, secret or setting
  - its target: SSM, Secrets Manager or the registry
  - whether a change needs a restart today
- **Covers:** PF-07, and the env reduction list for P10.4.
- **Done when:** every key is classified.

### P01.5 — Runtime settings audit

- **Do:** For each key in `server/src/lib/settings.ts` `DEFAULT_SETTINGS`, record:
  - its scope (platform, event or station) and who should be able to change it
  - whether it needs scheduling, whether it needs history
  - its validation bounds
  - its UI copy ("what changing this does")
- **Done when:** the registry design input is complete.

### P01.6 — Content audit

- **Do:** Inventory everything a volunteer reads that is event-specific: `content/brief.ts` (course
  one-liners, FAQs, escalation script, five things), map levels and safety points, the journey
  steps, `layout.tsx` metadata, `manifest.json` (name, icons, colours), and the `sw.js` precache
  list. For each, record its structure, so the ContentDocument schema covers it without free-form
  HTML.
- **Covers:** PF-08, and the P13.3 content model plus the offline caching requirement.
- **Done when:** a content schema draft is in F01.

### P01.7 — Time and timezone audit

- **Do:** List every place that interprets wall-clock time or a calendar date, on server, SQL and
  client. For each, record its current assumption and what it must take instead (event tz).
  Include DST hazards for non-Singapore events: overlapping shift blocks, day boundaries, and
  "within event hours".
- **Covers:** PF-06, and the P09.6 design and test cases.
- **Done when:** the list and the DST test cases are in F01.

### P01.8 — Summary and hand-off

- **Do:**
  1. Write the F01 summary: counts per class, top risks, and items that need owner input.
  2. Update `findings/preliminary.md` statuses for PF-04…PF-08.
- **Done when:** F01 is complete and linked from `findings/README.md`.

## Exit criteria

- `findings/F01-hardcoding.md` classifies every hit. Nothing is "TBD" without an owner question
  attached.

## Phase report

**Status: done (2026-09-25).** 8 of 8 steps done. No product code changed:
`git diff 1e81e6f..HEAD -- server client packages ops scripts` is empty.

### Summary

`findings/F01-hardcoding.md` classifies every one of the 1271 sweep hits into 45 items and 3
false-positive reasons, and `reports/P01/classify.mjs` proves it (exits 0, 1271 of 1271). On top
of the sweep it audits the 15 enums, 39 env keys, 16 runtime settings (plus 13 proposed), 11
content items and 16 wall-clock interpretations, with 12 DST and zone test cases for P09.6. The
owner answered D-02 (A: one organisation, many events) and D-04 (the two product rules become
per-event options, against the recommendation), and F01 applies both.

| Step  | Status  | Outcome                                                                                                         |
| ----- | ------- | --------------------------------------------------------------------------------------------------------------- |
| P01.1 | ✅ done | `reports/P01/sweep.sh` and `raw/`: 9 pattern groups, 1271 hits after the P01.2 widening (1223 at first)         |
| P01.2 | ✅ done | 45 items (F01-001…045) plus 2 with no literal (F01-048, 049); `classify.mjs` leaves nothing unclassified        |
| P01.3 | ✅ done | 4 enums become data (`StationKind` as capability flags), 11 stay invariants; `CommitteeRole` pending D-03       |
| P01.4 | ✅ done | Server 34 keys: 19 infra, 5 secret, 10 setting. Client 5 keys, all infra. Every change needs a restart or build |
| P01.5 | ✅ done | Scope, permission, schedule, history, bounds and UI copy for 16 keys (2 retire into data) and 13 new ones       |
| P01.6 | ✅ done | 11 content items, a plain-text ContentDocument schema draft, and the offline requirement for P13.4              |
| P01.7 | ✅ done | T-01…T-16 across server, SQL, client and ops; DST hazards; 12 test cases checked against `zoneinfo`             |
| P01.8 | ✅ done | F01 summary (6 top risks, 6 owner questions); PF-04…PF-08 confirmed; F01 linked from `findings/README.md`       |

**Exit criteria:** every hit is classified ✅. Nothing is "TBD" without an owner question: the open
items are D-03, D-12, a D-04 follow-up and three new questions listed in F01 § Summary ✅.

### Still open (not blocking P02–P04)

- **Before P05:** D-01, D-03, D-07/D-10, D-08, D-12, the fate of `feat/audit-cloudwatch` (PF-14),
  and the owner questions in F01 § Summary (D-04 follow-up, events past midnight, renameable
  vocabulary, locale).

### Deviations from plan

- **P01.1:** `infra/` does not exist on `main` (D-05), and `server/prisma/migrations/` and
  `package-lock.json` are excluded. The sweep was widened during P01.2: the region pattern missed
  Cognito IDs (a word boundary before `_`), and the enum pattern missed unquoted object keys such as
  label maps. Both fixes are in `sweep.sh` and the counts in `reports/P01/README.md`.
- **P01.2:** added `reports/P01/classify.mjs`, which the plan did not name, so "every hit is
  classified" is checked by a command rather than by eye. F01 groups hits by item rather than
  listing 1271 rows; `raw/CLASSIFIED.tsv` has one row per hit.
- **Defects found outside the audit's scope** are written up in F01 (§ Defects) rather than fixed:
  F01-046 (Medium) and F01-047, F01-050, F01-051, F01-052 (Low).
- **Checks:** lint (0 errors, the 131 expected guard warnings), `format:check` and `typecheck` were
  run. Unit, integration, e2e and build were not re-run because no product code changed.

### Metrics before → after

| Measure                      | End of P00      | End of P01           |
| ---------------------------- | --------------- | -------------------- |
| Lint errors / guard warnings | 0 / 131         | 0 / 131              |
| Functions > 50 / files > 300 | 97 / 18         | 97 / 18              |
| Guard counts (`arch:report`) | `P00-arch.json` | identical            |
| Hardcoding hits              | not measured    | 1271, all classified |

Snapshots: `reports/metrics/P01.json` and `P01-arch.json`.

### Findings added

F01-001…045 (inventory), F01-048 and F01-049 (D-04 rules), and the defects F01-046, 047, 050, 051
and 052. PF-04…PF-08 are confirmed, with statuses in `preliminary.md`.

### Follow-ups for later phases

- P02: the never-written states (`SwapStatus.CANCELLED`, `IncidentStatus.ACKNOWLEDGED`,
  `CardStatus.LOST`, `LostFoundStatus.DISPOSED`) and the unrendered `MANDATORY_BRIEF_POINTS`.
- P03: `singaporeHourStart` has no caller; `AttendanceMethod` is not mirrored in `enums.ts`.
- P05: the registry permissions and station overrides (P01.5), runtime versus build-time client
  config (P01.4), and the ambiguous-DST-end rule (P01.7).
- P09.2/P09.6/P10.1/P13.3: the designs in F01 §§ Enum, Settings, Content and Time are their input.

### Commits

`1e81e6f` D-02/D-04 · `a58c8a9` sweep · `1531f88` classification · `ecdac75` enums · `d7e892f` env
· `4a36ee9` settings · `b447bce` content · `2ed5dc9` time · `be587ef` summary, plus the
`chore(remediation): P01.x done` tracker commits and the phase close.
