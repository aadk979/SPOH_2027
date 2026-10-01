# Staging fixture and totals — 2026-10-01

P08.10's staging-only `seed-fixture` command ran on the `c62ea61` application image, after its migration and deploy succeeded. It overrides `NODE_ENV` for that one-off seed task only; the running API stays in production mode. The runner refuses a production stack name and checks that the resolved ECS cluster and task definition are staging resources. No production data or stack was touched.

| Check                | Evidence                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging fixture seed | ECS task `1654549e505f47688f2d603be47d76dc` exited 0; log: `SPOH 2027 and Dry Run, days from 2026-10-01` and `seed: done`.                                                                                                 |
| Staging totals       | ECS task `aadc025b29f34abb8377685e654db15d` exited 0; two events, zero missing event owners, zero mismatched membership references and zero cross-event relationship mismatches, including VisitorField and VisitorRecord. |
| Public smoke         | `infra/scripts/smoke.mjs` passed all six probes on the staging API Gateway URL: liveness, sign-in HTML, an event screen, old-address fallback, unsigned API rejection and private readiness.                               |

The production-shape `seed` command remains administrator-only. P08.10 remains in progress until Cost Explorer has three days of measured usage and the cost model is reconciled.
