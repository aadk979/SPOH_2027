# Findings

Audit output from P01–P04 and the consolidated backlog from P05.

| File                                     | Written in | Contents                                                                  |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| [`preliminary.md`](preliminary.md)       | planning   | issues seen while planning; each is verified or closed in an audit        |
| [`F01-hardcoding.md`](F01-hardcoding.md) | P01 (done) | every event-specific / fixed value, classified, with its target home      |
| [`F02-journeys.md`](F02-journeys.md)     | P02 (done) | role journeys, dead ends, missing screens, the interlinking matrix        |
| [`F02-screens/`](F02-screens/)           | P02 (done) | screenshots referenced from F02 (phone + laptop)                          |
| `F03-code-quality.md`                    | P03        | bugs with repros, the per-function refactor backlog, test gaps            |
| `F04-security-ops.md`                    | P04        | threat model, security findings, AWS and operational readiness            |
| `BACKLOG.md`                             | P05        | every open finding, deduplicated, prioritised, mapped to a phase and step |

## Finding format

```markdown
### F03-012 — Rate limiter uses per-process memory under PM2 cluster

- **Severity:** High
- **Area:** server/src/middleware/rateLimit.ts:28
- **Evidence:** what was observed, and how to reproduce it (command, test, screenshot)
- **Impact:** what goes wrong, for whom, and when
- **Fix:** the proposed change
- **Phase:** P15.2
- **Status:** open | fixed (commit) | wont-fix (reason) | duplicate-of (id)
```

## Severity

| Level       | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| **Blocker** | Data loss, security breach, or the event cannot run. Fixed before the next gate. |
| **High**    | Wrong numbers, broken role journey, or an exploitable weakness. Fixed before G5. |
| **Medium**  | Friction, confusion, or maintainability debt that slows the programme.           |
| **Low**     | Polish.                                                                          |
