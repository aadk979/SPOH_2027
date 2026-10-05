# Current coverage inventory — partial P08.9

Fresh Node 24 coverage on 5 October verifies the capture-management application
source 22a12eb in pushed release aa42013. All 2,301 server unit/integration checks
pass, with four existing skips, across 158 files in 585.30 seconds. The configured
server scope measures 95.58% lines and 86.53% branches, above P07's recorded
91.29% and 77.26%. Its existing 80/70 thresholds pass. Client coverage passes all
460 checks across 56 files in 29.76 seconds, measuring 69.73% lines and 61.37%
branches, above P07's 59.06% and 45.34%. The [bounded inventory](coverage-inventory-2026-10-05.json)
records exact counters, scopes, commands and exclusions.

The first server invocation omitted unit authentication fixture configuration
while disabling dotenv, so seven files imported zero tests. That owned coverage
run and its verified worker were stopped and excluded. The fresh accepted run
uses explicit local-auth test settings and both database URLs name spoh2027_test.
No real local database is reset, seeded or migrated; these measurements make no
staging/browser/cloud write.

This is an inventory, not the ADR-007 ratchet. The server's current scope omits
app/config/main composition and still excludes router.ts; those must be included
before a full overall floor can be established. CI does not yet run coverage,
and its floor file/checker and domain/application target checks remain open.
Raising a comparable configured metric does not prove the wider scope or G5
criteria. Seeded browser CI and the remaining P08.9 requirements also stay open.
