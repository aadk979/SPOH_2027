# January safety net (P06.12)

The ten findings in BACKLOG § _January safety net_, fixed on `main` before any P06 code moves, and
carried to the deployed line. Under D-01 C, January runs either the new platform (go on 28 Oct) or
the deployed line plus these fixes (no-go). ADR-009 §3 and Q-P5 put the fallback line on the branch
**`release/january`**, cut from `319d06d` (the audit branch, what `spoh2027.duckdns.org` runs).
That branch holds nothing but these cherry-picks.

- **`release/january`** = `319d06d` + 8 cherry-picks (`git cherry-pick -x`), head `be7af5a`.
- F03-001 and F02-002 are **already fixed** on `319d06d` (F03 § P03.9), so they are not picked.
- Verified on the branch (2026-09-27, scratch database `spoh2027_jan_test`, dropped afterwards):
  server unit 271 passed, server integration all passed with 7 skipped repros, client 25 passed,
  typecheck clean. `npm run lint` is red on the branch with 8 `no-console` errors, all in
  `test/do-inference.mjs`, which is already on `319d06d` (removed on `main` in P00, PF-03). It is
  not a P06.12 finding and is left alone.

## Fixes

| Finding | Fix                                                                      | `main`    | `release/january` | Applies to `319d06d`                                                         | Test                                                                                             |
| ------- | ------------------------------------------------------------------------ | --------- | ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| F03-001 | escalation rules on the roster import and provisioning                   | `55b6430` | —                 | **already fixed** (the branch rewrote both; conflicts, not picked)           | `repro/roster.test.ts`: 3 repros un-skipped, plus a role-change audit test                       |
| F02-002 | per-person placeholder `cognitoSub` in the import preview                | `e64661d` | —                 | **already fixed** (`pending:<email>` on the branch; conflicts, not picked)   | `repro/roster.test.ts`: repro un-skipped                                                         |
| F02-006 | every today and last-hour window bounded above by now                    | `f0e75ff` | `27cf7c2`         | yes; the repro file is new there and was added from `main`                   | `repro/numbers.test.ts`: repro un-skipped                                                        |
| F02-027 | no-shows only once a block has ended; `notYetDue` reported               | `0e316a9` | `7a2aff3`         | yes                                                                          | `repro/numbers.test.ts` repro un-skipped; `report.test.ts` rate test runs after the day's blocks |
| F03-012 | import rows keyed by row number as well as content                       | `b5b0846` | `61a7bb1`         | yes                                                                          | `repro/numbers.test.ts`: repro un-skipped, plus the footfall case                                |
| F04-013 | `POST /lost-person` replay stores the id only; the purge scrubs old rows | `a899f0e` | `109e7f4`         | yes; the repro file is new there and was added from `main`                   | `repro/security.test.ts`: repro un-skipped, plus replay and legacy-row tests                     |
| F04-006 | `signInRateLimit`: sign-in routes count failed requests only             | `6437125` | `087f139`         | **conflict**, resolved: adjacent import lines in `auth/router.ts`; kept both | `repro/security.test.ts`: repro un-skipped, plus "failed sign-ins are still limited"             |
| F03-033 | outbox: 401 held until sign-in, `IDEMPOTENCY_IN_PROGRESS` retried        | `bd97343` | `6ef682e`         | yes; the repro file is new there and was added from `main`                   | `client/tests/repro/outbox.test.ts`: 2 repros un-skipped                                         |
| F04-003 | outbox entries record their owner; a flush sends only the owner's        | `d0148a5` | `44dc579`         | yes, after F03-033 (it builds on that commit)                                | `client/tests/repro/outbox.test.ts`: repro un-skipped (now signs Sam and Alex in), plus a case   |
| F01-046 | shift labels from the configured `shiftBlocks` setting                   | `c64552b` | `be7af5a`         | yes                                                                          | `client/tests/repro/shiftLabels.test.ts` (new)                                                   |

"The repro file is new there": the P03/P04 repro files were written on `main` after the branch
diverged. Each pick that meets one takes `main`'s version of the file at that commit, so the
branch carries the same repros, with the not-yet-fixed ones still skipped.

## Before deploying `release/january`

These matter only on the no-go path, when the owner deploys this branch to Lightsail. Nothing here
has been deployed. D-13 keeps the live site the owner's.

1. **Deploy as usual:** `git show 319d06d:infra/runbooks/deploy.md` with `<branch>` =
   `release/january`. None of the fixes adds a migration.
2. **Fallback imports (F03-012).** Import rows now have different idempotency keys. A file imported
   **before** the deploy and re-run **after** it is imported again. Reconcile such a file by hand
   instead of re-running it.
3. **Lost-person replays (F04-013).** Replay rows stored before the deploy keep their description
   until the purge reaches their alert (24 hours after it is resolved), or until the 7-day prune.
   The purge now reduces them to the alert id.
4. **Sign-in limit (F04-006).** Successful sign-ins no longer count. Owner action A3 (raising the
   limit on the box) is not needed with this branch deployed, and is harmless if already done.
5. **Outbox (F04-003).** Captures queued on a phone by the old build carry no owner, so they are
   sent under whoever signs in next, as before. Only captures queued after the upgrade are held
   for their owner.

## Left for later steps

- **F02-006:** refusing import rows outside the event day is P09.4. This step bounds the reads.
- **F03-033:** a "send again" action for parked entries is P14.4.
- **F04-003:** a sign-out prompt to send or discard what is still queued is P07.11.
- **F04-006:** per-account keys and a shared store are P15.2.
- **F04-013:** backup retention is P08.7.
- **F03-043**, filed while fixing F03-001: a Deputy's roster import creates accounts although
  only Chief and Admin hold `user.provision`. It is not an escalation (F03-001's rules now hold),
  and `319d06d` already refuses it, so it is homed in P06.13 rather than fixed here.
