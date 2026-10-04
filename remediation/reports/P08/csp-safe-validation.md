# Client validation under the deployed CSP

The enabled-media staging browser probe found one script-src violation on full
page load. The installed Zod 4 implementation probes evaluation availability with
Function, catches its refusal and falls back to its interpreter. CSP still reports
the caught probe. Object upload, private reads and normal application operation
work, but the event prevents a clean browser-policy verification.

The client synchronously selects Zod's jitless interpreter in Next's
instrumentation-client entry before application schemas load. Its explicit package
side-effect entry preserves this initialization in production builds. No CSP
permission, registered schema, server validation or product flow changes. The
client unit harness runs the same initialization before importing application
code, so form/contract checks exercise the selected interpreter too.

The installed Next instrumentation-client and static-export guides were read
before the client change. This uses the supported synchronous entry; initialization
does not wait for an effect or asynchronous import.

## Verification

The new real-static-export browser regression first fails against the preceding
export with exactly script-src / eval. After the change, phone and laptop startup
and hard reload report zero CSP events and application errors. The legitimate
Cognito login endpoint remains available; no local roster-email form appears.
Invalid runtime configuration still stops startup and offers no sign-in fallback.
The test runs the production static middleware with its unchanged restrictive
script policy and blocks service workers. It creates no database/session fixture
or external identity request.

Run after building the export:

```powershell
$env:SPOH_STATIC_EXPORT='1'
npm run build --workspace client
npm run test:static-csp --workspace client
```

All 426 client checks across 55 files pass with the production interpreter enabled.
The 32-page static export, client types, root lint, architecture (1,026 modules /
4,507 dependencies), hardcoding and formatting checks pass. Client source/tests,
reports and the 623-commit history scan are clean. The three preserved P08 pricing
hashes and historical P05 files remain unchanged.

The normal unit CI does not run this browser command or create a static export.
Exact-image CI/deployment and the read-only normal-Cognito continuation are
recorded after they pass. The preceding private media evidence retains its actual
violation; it is not rewritten as clean.

P08.7 remains open for its other storage criteria. No schema, migration or database
use case changes. The preceding 1,468-pass/four-skip database suite, 112 focused
media checks, two retry/a11y journeys and 58 unchanged visuals remain applicable.
