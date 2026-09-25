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

_Fill in on completion._
