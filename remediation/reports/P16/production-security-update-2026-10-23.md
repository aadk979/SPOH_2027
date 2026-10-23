# Production dependency security update — 23 October 2026

The first production candidate, `2e8de556f5c21e67bd3c15b6e0ce785c69996a7b`, was blocked by CI's unchanged dependency audit: Next.js 16.3.8 falls within newly observed critical/high advisories. No production deployment occurred from that candidate.

Upgrade the client to the fixed **Next.js 16.4.1**, as specified in the [official security release](https://nextjs.org/blog/nextjs-security-update-october-14-2026). The lockfile changes only the framework and its package family; preserve the audit gate and existing exceptions. The application serves a static export, but this is not used to waive the dependency gate.

Pin both production Docker base stages to **Node 24.22.1**, matching the [21 October Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). New local production controllers use that exact runtime and npm 11.11; older Node24.19 controllers/receipts remain untouched historical evidence.

Validation requires a clean dependency audit, affected client/static-build checks and the full exact-candidate CI, including isolated PostgreSQL coverage and the production-origin infrastructure regressions. Preserve the first failed CI and partials. Production creation/cutover, the Root invitation and three DRAFT events proceed only on the fixed accepted release under the owner's recorded USD125/month approval.
